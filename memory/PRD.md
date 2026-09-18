# BIDZONE — Product / Engineering Memory

## What BIDZONE is
Real-Time Social Auction dApp on Monad. **NOT** an NFT marketplace, **NOT** a
livestreaming platform. "Live" means real-time auction activity. All auction
economics (starting bid, current bid, minimum increment, timer, status, bid
history) must be fully transparent. **No secret reserves, no secret minimums.**

## Stack
- Frontend: Lovable
- Source control: GitHub
- Database / auth / storage / realtime: Supabase
- Chain / escrow / bidding: Monad
- Wallet Web3 auth: later phase

## Phase progress
- Phase 3: Existing UI (kept intact, developed outside this workspace)
- **Phase 4.1: ✅ Initial Supabase schema — this workspace (SQL migration files)**
- Phase 4.2+: Server-side services for shipping / escrow / reputation writes
- Phase 5: Monad smart contracts, real bidding + escrow settlement, wallet auth

## Phase 4.1 deliverables (this workspace)
Location: `/app/supabase/`
- `migrations/20260201000001_bidzone_schema.sql` — 14 tables, indexes, constraints, triggers
- `migrations/20260201000002_bidzone_rls.sql` — RLS policies
- `migrations/20260201000003_bidzone_realtime.sql` — realtime publication
- `migrations/20260201000004_bidzone_dev_seed.sql` — `[DEV]` demo data
- `README.md` — full schema/RLS/realtime summary + approval checklist

## Non-negotiable data rules
- Financial values → `NUMERIC(38,18)`. Never floating-point.
- Wallet addresses → text; case-insensitive uniqueness via `lower()`.
- No column ever stores private keys or seed phrases.
- Shipping addresses are private, never exposed publicly.
- Bids: no client UPDATE/DELETE. Server-side triggers only.
- Escrow / reputation / shipping mutations: service role only.

## Backlog (next phases)
- P0: Auth users → profile seed real UUIDs
- P0: Edge functions for shipping create/update, escrow write-back from Monad indexer
- P0: Smart-contract mirror service (reputation_events + escrow_transactions)
- P1: Wallet-based Web3 auth alongside Supabase auth
- P1: Realtime frontend wiring (auctions/bids/comments/reactions/notifications/shipping)
- P2: Anti-sniping tuning; region validation for allowed_regions
