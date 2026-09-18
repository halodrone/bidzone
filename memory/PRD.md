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
- **Phase 5.1: ✅ BIDZONE Home page UI (React) — this workspace**
- **Phase 5.2: ✅ BIDZONE Auction Room UI (React) — this workspace**
- Phase 4.3+: Server-side services for shipping / escrow / reputation writes
- Phase 5.2+: Auction Room, Create Auction form, Profile, etc.
- Phase 6: Monad smart contracts, real bidding + escrow settlement, wallet auth

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
- P0: Auth users → profile seed real UUIDs
- P0: Edge functions for shipping create/update, escrow write-back from Monad indexer
- P0: Smart-contract mirror service (reputation_events + escrow_transactions)
- P1: Wallet-based Web3 auth alongside Supabase auth
- P1: Realtime frontend wiring (auctions/bids/comments/reactions/notifications/shipping)
- P2: Anti-sniping tuning; region validation for allowed_regions
