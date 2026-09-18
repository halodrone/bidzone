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
- Phase 4.1: ✅ Initial Supabase schema — SQL migration files
- Phase 4.1 fix-up: ✅ Auction field protection + anti-sniping default = 10s
- Phase 4.2: ✅ Server-side lifecycle handlers, cron functions, idempotent transitions — 26/26 tests pass
- Phase 5.1: ✅ BIDZONE Home page UI (React)
- Phase 5.2: ✅ BIDZONE Auction Room UI (React)
- Phase 6.1: ✅ Supabase Storage + Auction Media (PRIVATE bucket + orphan-safe flow)
- Phase 6.2: ✅ Supabase Auth (Google-only MVP + pre-flight provider check + session persistence)
- Phase 6.3: ✅ Embedded Wallet foundation (Privy + viem) — honest "unavailable" state until App ID set
- **Phase 6.4: ✅ Functional Auction — application-level bidding, OUTBID notifications, live updates, ENDED state** (backend 23/23 + frontend 21/21, 2026-02-03)
- Phase 6.5: ⏳ Monad testnet + smart contract + onchain escrow (NOT started — awaits explicit user go-ahead)

## Phase 5.1 deliverables (this workspace)
- `/app/frontend/src/pages/Home.jsx` + `components/home/*` — full Home page
- `/app/frontend/src/lib/supabase.js` — env-driven client (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`); returns `null` when unconfigured so empty-state renders — never fabricates rows
- `/app/frontend/src/hooks/useLiveAuctions.js` — live/ending-soon/trending/all filters
- `/app/frontend/src/index.css` — full BIDZONE dark theme + Unbounded/Manrope fonts
- All 9 required categories including Luxury + Jewelry
- 4 filter tabs, each with its own polished empty state
- Fee transparency block: 2.5% platform / 97.5% seller (no buyer premium)
- Mobile-first responsive; verified no horizontal overflow at 390px; drawer nav

## Non-negotiable data rules
- Financial values → `NUMERIC(38,18)`. Never floating-point.
- Wallet addresses → text; case-insensitive uniqueness via `lower()`.
- No column ever stores private keys or seed phrases.
- Shipping addresses are private, never exposed publicly.
- Bids: no client UPDATE/DELETE. Server-side triggers only.
- Escrow / reputation / shipping mutations: service role only.

## Backlog (next phases)
- P0: Phase 6.5 — Monad testnet smart contract + onchain escrow settlement (wait for user green-light)
- P0: Edge functions for shipping create/update, escrow write-back from Monad indexer
- P0: Smart-contract mirror service (reputation_events + escrow_transactions)
- P1: Wallet-based Web3 auth alongside Supabase auth
- P1: Realtime frontend wiring extras (comments/reactions/notifications/shipping)
- P2: Anti-sniping tuning; region validation for allowed_regions

## Phase 6.4 deliverables (2026-02-03)
- Migration `20260203000002_bidzone_bid_wallet_optional.sql` — bids.wallet_address nullable
  (application-level bids before wallet exists remain honest, no fake addresses).
- Migration `20260203000003_bidzone_outbid_notifications.sql` — extends
  `tg_after_bid_insert` to emit OUTBID notifications per distinct prior bidder
  (dedup_key `outbid:<auction_id>:<bid_id>:<bidder_id>`).
- Frontend BiddingPanel with real submit path (`useAuctionRoom.submitBid`),
  string-safe decimal math (BigInt), live current-bid/min-next updates,
  OutbidWatcher toast, ENDED disabled CTA.
- 3rd test user Seller C provisioned via SQL (auth.users + auth.identities
  with empty-string token defaults required by GoTrue; profile auto-created
  by `on_auth_user_created` trigger). Credentials in `memory/test_credentials.md`.
- Reference test suite: `/app/backend/tests/phase64_server_tests.py` — 23/23 PASS.
