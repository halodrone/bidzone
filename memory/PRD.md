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
- **Phase 6.5 — Deployment: ✅ BidzoneAuction live on Monad Testnet** (chain 10143): contract 0x05fE75cdC84deA944966D15c25c6633C03048EB5, treasury 0x0F45ebc33c82cf4bc940379de10d111F3beBb88c, FEE_BPS 250. Read-only on-chain checks verified.
- **SECURITY + PROFILE phase: ✅ PASS** (auth guards, wallet identity, RLS audit, withdraw, /profile — 12/12 + full security matrix).
- **AUTH + MOBILE/UI phase: ✅ PASS** (2026-09-20): mobile top-clipping ROOT CAUSE fixed (backdrop-filter on <header> created a containing block that collapsed the fixed MobileNav drawer to the header box — drawer now rendered outside the header); reactions + comments auth WIRED to existing tables/RLS/realtime (authenticated toggle/submit + persistence, unauthenticated get the Google sign-in modal — no silent failures, no anonymous rows); functional navigation (Live Zone/Explore/categories now filter the Home live listing via ?tab/?category, Profile+Wallet added to mobile drawer, honest coming-soon states for search/Bell/socials); lint 0 issues + build PASS; regression 10/10 by testing agent. Out of scope kept out: Physical Auction, contract/RLS/escrow changes.
- **Create Auction UI polish: ✅ PASS** (2026-09-20): `bz-input` was an undefined class (native white inputs) — now defined in index.css (near-black bg, white text, gray placeholder, purple focus ring, dark selects with custom chevron + dark option list); short numeric fields (Starting Bid / Min Increment / Anti-Sniping / Duration) compacted to sm:w-40/w-44; Title/Description stay wide; zero logic changes; verified desktop + 360px mobile (0 overflow), lint + build PASS.
- **Phase 7 Physical Auction: ✅ PASS** (2026-09-21): full physical flow end-to-end on EXISTING architecture — additive migration only (auctions.shipping_origin + addresses_select_fulfillment_seller RLS policy + tg_require_physical_address bid gate trigger); NEW frontend: physical fields in CreateAuction (origin/destinations/72h note), PHYSICAL badge + Shipping row in Auction Room, physical bid gate (no address → blocked + AddressModal), My Activity (Purchases/Sales/Bids) in Profile with full fulfillment ladder (payment secured → address → shipped (carrier+tracking, TRACKING_REQUIRED guard) → delivered → 48h window → confirm/dispute → release/refund) + 2.5/97.5 fee breakdown; backend service-role routes (fund stamp + tracking) with JWT+party verification (503-honest until service key — indexer write-back stays a backlog item); E2E verified live incl. edge cases A/B/D/L/M/N/O, anti-sniping (+10s replace), 48h-from-DELIVERED-only, dispute freeze + RESOLVED_BUYER refund, reputation events, notification chain; testing agent PASS. Physical Auction COMPLETE.
- **Phase 7.2 NFT Auction: 🟡 CODE + CHAIN DONE, UI E2E BLOCKED BY EXTERNAL PRIVY ALLOWLIST** (2026-02-04 → 2026-02-09):
  - RESUME NOTE (2026-09-21): pod restored again; envs re-created (14 REACT_APP_* incl. NFT set). Collection tab EXISTS (MyActivity.jsx, activity-tab-collection) — the earlier "missing feature" report was a stale-bundle artifact. UI E2E still needs current preview origin in Privy dashboard allowlist.
  - Contracts DEPLOYED to Monad Testnet 10143: BidzoneNFT `0xd9C88e4BA9212beC56e81afFAB9d3c24D5bc78b5`, BidzoneNFTEscrow `0x5A892f790cfa94Ff886983aaFCeeBD6D98963647`.
  - 44 Hardhat tests PASS (30 existing BidzoneAuction UNTOUCHED + 14 NFT).
  - `scripts/e2eNFT.js` all core PASS (mint → ownerOf=seller; approve+register → ownerOf=escrow; winner bid; settle → ownerOf=winner + treasury +2.5% exact + seller +97.5% exact; double-settle reverted).
  - Additive migration `20260204000002_bidzone_nft.sql` APPLIED by user (nft_tokens + nft_events + public-read metadata + realtime pub).
  - Backend: `GET /api/nft-metadata/{auctionId}` (dynamic tokenURI gateway, public, fresh signed image URL, METADATA_BASE_URL env).
  - Frontend: `lib/nft.js` (isNftAvailable/mint/approve+register/bid/settle/safeTransfer), CreateAuction NFT type + publish sequence (mint → record → approve → escrow, user-signed), BiddingPanel NFT branch, NftPanel on-chain ownerOf, MyActivity Collection tab (activity-tab-collection) with on-chain ownerOf re-read, Send NFT modal (address validation + safeTransferFrom + TRANSFER event).
  - Lint clean, build PASS 300.82s. Bug fix (2026-02-09): added missing imports `isNftAvailable` + `placeBidNftOnchain` from `@/lib/nft` to `BiddingPanel.jsx` (blocking lint errors).
  - **BLOCKER (external, not code)**: Privy dashboard `Allowed Origins` list for App ID `cmu739eqk00fk0dlbr0m5ubxu` is stale. Current preview URLs (`repo-setup-144.preview.emergentagent.com`, `c0184be7-b943-4216-b94f-28b6dc13e12c.preview.emergentagent.com`) are NOT allowlisted → Privy iframe blocked by CSP `frame-ancestors` → wallet-chip-error → all wallet-signed flows (mint, approve, register, bid, settle, refund, send NFT) blocked in the browser UI. Contract-layer verification is COMPLETE via Hardhat + on-chain e2eNFT.js; UI E2E resumes the moment the user adds the current preview origin(s) to the Privy dashboard.
  - Verified non-wallet flows: CreateAuction NFT selector present; MyActivity Collection tab renders with `activity-tab-collection` testid + `collection-empty` empty-state; /profile, /create, Home, /explore render fine.

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

## Phase 6.5 — Deployment (2026-02-03, Monad Testnet) — PUBLIC DATA ONLY
- Contract: BidzoneAuction @ 0x05fE75cdC84deA944966D15c25c6633C03048EB5
- Deployment tx: 0x598df7a8115952c3ddde96f675759dcb2302cf5fb973aad7c171398221c2dfff (block 63714325, gas 1,348,772)
- Deployer address: 0x74f66a3F3B63c6D3f9d7ec9e0Eb8680F698cF5a4
- Treasury address: 0x0F45ebc33c82cf4bc940379de10d111F3beBb88c
- Chain ID: 10143 (Monad Testnet)
- Compiler: solc 0.8.30, evmVersion osaka (Monad requirement), optimizer 200
- Unit tests re-run on osaka compiler: 30/30 PASS
- Private key lives ONLY in /app/contracts/bidzone/.env (gitignored, never displayed)
- **Phase 7.2 FINAL — Model B (NFT asset system): 🟡 IMPLEMENTED + PARTIALLY VERIFIED, WALLET-E2E BLOCKED BY PRIVY ALLOWLIST** (2026-09-21): Escrow contract UNCHANGED (already generic (nft,tokenId)-keyed — arbitrary ERC-721 supported, no redeploy). Hardhat 57/57 (incl. 13 Model B: arbitrary collection escrow/owner-only/approval/double-escrow/2-collections-same-tokenId/setApprovalForAll/immoveable-escrow/cancel-relist/winner-ownerOf/dup-settle). Migration 20260204000003 APPLIED (auction_type widened to NFT — live-proven check-violation bug — + nft_auctions link table + discovery indexes). Backend /api/nft-metadata-proxy (SSRF-guarded CORS fallback). Frontend: nft.js rewritten (env bug fixed, debug shim removed, (contract,tokenId)-parameterised + metadata ipfs/multi-gateway/data: + Transfer-log discovery + injected-wallet receive leg); collection components NEW (MyCollection wallet-owned grid AVAILABLE/IN AUCTION/IN ESCROW, NftDetailModal, ReceiveNftModal, SendNftModal with full validation); CreateAuction Model B deep-link (auctionNft=contract:tokenId, NO mint/upload/manual fields, publish = verify→approve→escrow→index); BiddingPanel/NftPanel/EndedState per-token nft_contract + NFT-aware refunds (BidzoneNFTEscrow refundOf/claimRefund) + chain-aware SettleNftAction; MyActivity ?tab=collection deep-link (bug fixed); +30min duration option (additive). Non-wallet E2E self-run PASS (T5 partial, T20, T21, T22a, T23 mobile 360/412). **BLOCKER: Privy allowed-origins missing current preview origin — wallet provisioning blocked (CORS + frame-ancestors) — T1–T19 await user Privy Dashboard action.**
