from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import requests


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# =============================================================================
# BIDZONE Phase 7 — Physical Auction service-role endpoints.
#
# Architecture (PRD): escrow / shipping status mutations happen ONLY via the
# service role — never from the browser. These thin routes call the EXISTING
# Phase 4.2 SECURITY DEFINER RPCs (mark_escrow_funded / update_shipping_tracking)
# after verifying the caller's Supabase JWT and their party role:
#   * /escrow/fund    — caller must be the escrow BUYER (payment mirror stamp;
#                       on-chain the winning bid was already escrowed by the
#                       contract at bid time; the Monad indexer write-back is
#                       a deferred backlog item, this is the honest MVP path)
#   * /shipping/tracking — caller must be the shipment SELLER (manual MVP
#                       tracking updates; DELIVERED starts the 48h window
#                       inside the existing RPC)
# If SUPABASE_SERVICE_ROLE_KEY is not configured the routes answer 503
# SERVICE_ROLE_NOT_CONFIGURED (honest) and nothing else changes.
# =============================================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


class FundRequest(BaseModel):
    transaction_hash: Optional[str] = None


class TrackingRequest(BaseModel):
    status: str


def _verify_supabase_user(authorization: str):
    """Returns the auth user id for a Supabase JWT, or raises 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    token = authorization.split(" ", 1)[1].strip()
    if not (SUPABASE_URL and SUPABASE_ANON_KEY):
        raise HTTPException(status_code=503, detail="SUPABASE_NOT_CONFIGURED")
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
        timeout=15,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="INVALID_SESSION")
    user = r.json()
    return user.get("id")


def _rpc(p_fn_path: str, p_payload: dict):
    """Calls a Postgres RPC with the service role. 503 when unconfigured."""
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(status_code=503, detail="SERVICE_ROLE_NOT_CONFIGURED")
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{p_fn_path}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        json=p_payload,
        timeout=20,
    )
    if r.status_code >= 400:
        # Surface the DB's own guard message (INVALID_STATE_*, NOT_BUYER, ...)
        detail = r.text[:200] or f"RPC_ERROR_{r.status_code}"
        raise HTTPException(status_code=r.status_code, detail=detail)
    return r.json()


def _escrow_party(auction_id: str, user_id: str, role: str):
    """Reads the latest escrow row for an auction via service role and
    verifies the caller holds the required party role."""
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(status_code=503, detail="SERVICE_ROLE_NOT_CONFIGURED")
    rows = requests.get(
        f"{SUPABASE_URL}/rest/v1/escrow_transactions",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        params={
            "auction_id": f"eq.{auction_id}",
            "select": "id,buyer_id,seller_id,status",
            "order": "created_at.desc",
            "limit": "1",
        },
        timeout=15,
    ).json()
    if not rows:
        raise HTTPException(status_code=404, detail="ESCROW_NOT_FOUND")
    escrow = rows[0]
    if escrow.get(f"{role}_id") != user_id:
        raise HTTPException(status_code=403, detail=f"NOT_{role.upper()}")
    return escrow


@api_router.post("/auctions/{auction_id}/escrow/fund")
def fund_escrow(auction_id: str, body: FundRequest,
                authorization: str = ""):
    user_id = _verify_supabase_user(authorization)
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="SERVICE_ROLE_NOT_CONFIGURED")
    escrow = _escrow_party(auction_id, user_id, "buyer")
    result = _rpc("mark_escrow_funded", {
        "p_escrow_id": escrow["id"],
        "p_transaction_hash": body.transaction_hash,
    })
    return {"result": result}


@api_router.post("/auctions/{auction_id}/shipping/tracking")
def update_tracking(auction_id: str, body: TrackingRequest,
                    authorization: str = ""):
    user_id = _verify_supabase_user(authorization)
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="SERVICE_ROLE_NOT_CONFIGURED")
    # Verify the caller is the shipment's seller before invoking the RPC.
    ships = requests.get(
        f"{SUPABASE_URL}/rest/v1/shipping",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        params={
            "auction_id": f"eq.{auction_id}",
            "select": "id,seller_id",
            "limit": "1",
        },
        timeout=15,
    ).json()
    if not ships:
        raise HTTPException(status_code=404, detail="SHIPPING_NOT_FOUND")
    if ships[0].get("seller_id") != user_id:
        raise HTTPException(status_code=403, detail="NOT_SELLER")
    result = _rpc("update_shipping_tracking", {
        "p_auction_id": auction_id,
        "p_new_status": body.status,
    })
    return {"result": result}

# Include the router in the main app
app.include_router(api_router)



app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()