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
- **Phase 6.5: 🟡 Smart contract READY — awaiting user deployment** (contract + 30/30 tests + frontend wiring + additive DB migration, 2026-02-03). Contract address unset until user runs `npm run deploy:monad`. E2E on-chain testnet verification pending deploy + faucet.

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
- P0: Phase 6.5b — user deploys `BidzoneAuction` to Monad Testnet, sets `REACT_APP_MONAD_CONTRACT_ADDRESS` + `REACT_APP_BIDZONE_TREASURY_ADDRESS`, funds A/B/C wallets, run E2E on-chain verification
- P0: Phase 6.6 — Delivery / shipping / dispute UX (DO NOT start until 6.5 fully verified)
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

## Phase 6.5 deliverables (2026-02-03) — code-complete, deployment-pending
- `/app/contracts/bidzone/` — Hardhat project.
- `contracts/BidzoneAuction.sol` (Solidity 0.8.24, OpenZeppelin ReentrancyGuard,
  paris EVM target for Monad compat). Immutable treasury, immutable
  `FEE_BPS=250`. Anti-sniping REPLACES `endTime` (no stacking).
  Pull-based refunds. English ascending auction. Checks-effects-interactions
  + `nonReentrant`. Rejects plain MON transfers.
- 30/30 Hardhat tests passing (7 groups: deployment, creation, bidding rules,
  outbid & refund, anti-sniping, settlement, safety) + 1 dedicated
  reentrancy attack test.
- `scripts/deploy.js` — refuses to run when `BIDZONE_TREASURY_ADDRESS` is
  empty or equal to the deployer (no fallback). Prints only public data.
- Frontend wiring (env-driven):
  - `frontend/src/lib/contracts/BidzoneAuction.abi.json` (from Hardhat build)
  - `frontend/src/lib/bidzoneAuction.js` — viem read/write helpers +
    `auctionIdFromUuid` (keccak256 of Supabase UUID → bytes32).
  - `context/WalletContext.jsx` — exposes `privyWallet` handle for signing.
  - `pages/CreateAuction.jsx` — on-chain `createAuction` after publish when
    contract configured + wallet ready; DB row updated with
    `contract_auction_id`, `chain_id`, `contract_address`, `creation_tx_hash`.
  - `components/auction/BiddingPanel.jsx` — dual-mode bid path
    (on-chain when configured, app-level otherwise); explorer link;
    pull-based `RefundPanel` when refund > 0.
  - `components/auction/EndedState.jsx` — "Settle on-chain" button visible
    when configured + wallet ready; shows explorer tx link.
- Additive Supabase migration `20260203000004_bidzone_onchain_columns.sql`:
  auctions {contract_auction_id, chain_id, contract_address, creation_tx_hash},
  escrow_transactions {chain_id, contract_address}. No column removal, no
  destructive change to existing tables.
- Regression: 23/23 Phase 6.4 backend matrix + frontend production build PASS.
- Test users unchanged: A / B / C. No secrets committed anywhere.
