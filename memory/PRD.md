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
- **Targeted Seller/NFT/Collection Fixes: ✅ PASS** (2026-09-23): Auction cards now normalize the seller relation and display only the existing profile username, with current-account email local-part fallback; no seller UUID/auth ownership changes. NFT Create Auction hides only the MediaUploader for `auctionType=NFT`; Physical media remains unchanged. Existing `nftAsset.meta.image` is reused for NFT preview and inserted into existing `auction_items` media references. Home retains internal `collectibles` slug but maps its showcase/chip to NFT and filters that selection by `auction_type=NFT`. Collection/My Activity mobile layout constraints prevent 360/390 overflow. Testing agent verified 9/9 requested scenarios after fixing a `useLiveAuctions` query-builder declaration regression (`const base` → `let q`); NFT publish was source-verified only because no on-chain transaction was run.

- **Final Polish Phase: ✅ PASS** (2026-09-23): Functional keyword search added to Home via URL-driven Supabase auction filtering with exact `No results found.` empty state; display-only Home showcase label changed from Collectibles to NFT while the underlying `CATEGORIES` entry remains `collectibles`; showcase disclaimer removed. Create Auction hides Condition for NFT and removes the Anti-Sniping Window input while preserving the default 10-second payload behavior. Profile and Wallet copy cleaned exactly as requested. Collection cards received responsive `min-w-0` constraints for 360/390px. Testing agent verified 11/11 requested UI scenarios PASS across desktop, 360px, and 390px with zero horizontal overflow. A broad build command still reports pre-existing dependency/lint issues outside this polish scope (`@farcaster/mini-app-solana`, BiddingPanel, NotificationCenter, WalletContext, Profile lint warnings); no changed-file feature regression was reported.

- **Phase FINAL UX FIX: ✅ IMPLEMENTED** (2026-09-23): (a) Mobile Auction Ended clipping fixed at 360/390px — added `min-w-0` + `shrink-0` on the winner banner flex container in `EndedState.jsx` so long addresses/tracking labels wrap instead of overflowing the `overflow-hidden` section. (b) Buyer/Seller role separation in Profile → My Sales: `useMySales` in `lib/shipping.js` now filters `auctions` by `seller_id = auth.uid()` — buyers no longer see their winning auctions in the Sales tab with seller controls. Existing server-side auth on `seller_record_shipment(3+4-arg)` + `update_shipping_tracking` (NOT_SELLER exception) was already in place and is now the DB-side defense. (c) Silent Admin Dashboard: migration `20260701000002_bidzone_admin_role.sql` adds `profiles.is_admin boolean default false` + admin-gated `resolve_dispute` RPC (NOT_ADMIN exception, granted to authenticated) + admin-read RLS policy on `disputes` for full moderator visibility. New `/admin` route + `AdminDashboard.jsx` (lists OPEN/UNDER_REVIEW disputes, resolve via existing RPC: Release/Refund/Cancel + optional notes). AuthContext now fetches `is_admin` with a graceful fallback when the column is not yet in the live DB. Non-admins silently redirected to `/`, no admin surface visible. Testing agent PASS 4/4 admin flow (anonymous redirect, non-admin redirect, admin link hidden on Profile, AuthContext fallback). **REQUIRES USER ACTION: apply `/app/supabase/migrations/20260701000002_bidzone_admin_role.sql` in the live Supabase project + set `is_admin=true` on the target profile row.**

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
  - **Phase 7.4 Role-specific physical room: ✅ PASS** (2026-09-22): EndedState PhysicalSettlement rewritten into role-branded panels — BUYER "Your Purchase" (PAYMENT secured+tx / DELIVERY rail+carrier+tracking+ProvideAddress in-room / RECEIPT Confirm+Dispute in-room at DELIVERED; terminal states) vs SELLER "Your Sale" (SALE info / SHIPPING ShipForm+TrackingButtons in-room / SETTLEMENT waiting→ready→Settle on-chain→chain-aware "Settlement complete"). Shared lifecycle components exported from MyActivity (zero duplication). ShipForm PENDING-row condition bug fixed. E2E PASS on real auction (all in-room): buyer never sees seller controls (settle/mark*/ship-form = 0), seller never sees buyer controls (confirm/dispute = 0), third parties get no surfaces. Build PASS 51.64s.
  - **Phase 7.3 Physical post-win alignment: ✅ PASS** (2026-09-21): user-reported role/lifecycle bug (buyer saw 'Settle on-chain'; ladder deadlocked at 'Awaiting payment'). ROOT CAUSES: (a) EndedState rendered generic SettleAction to EVERYONE for non-NFT — contract settleAuction transfers 97.5/2.5 IMMEDIATELY (no physical gating in contract — protection is app-level by design); (b) escrow stuck PENDING forever (fund stamp = service_role-only route, unconfigured) although on-chain bids lock funds at bid time. FIXES (no contract/RLS/NFT changes): migration 20260205000001 (close_auction v2: on-chain winning bid + PHYSICAL/DIGITAL → escrow FUNDED at close w/ funded_at + ship_by 72h + bid tx hash; idempotent backfill repairs stuck rows incl. 'Motor') + migration 20260205000002 (update_shipping_tracking party-gates the SELLER inside the RPC, service_role JWT still allowed; grant authenticated; frontend switches to direct party RPC) + EndedState role-gated PhysicalSettlement (buyer: Payment secured + shipping lifecycle + carrier/tracking/timestamps, NEVER settle; seller: settlement status + Settle on-chain ONLY at RELEASED; third parties: nothing; NFT branch untouched) + MyActivity PendingPayment dead 503 button removed (honest note). E2E PASS on real MON: bid → FUNDED-at-close → address → ship (JNE) → In Transit → Delivered (+48h deadline) → buyer Confirm → RELEASED → seller Settle → statusOf=4 + treasury +2.5% EXACT. Buyer never saw settle (testid-verified at every step). Build PASS.
  - **Phase Polish 2 — Cinematic Story Landing: ✅ PASS** (2026-09-21): Landing rewritten as a 10-chapter scroll narrative (Welcome hero w/ drifting gavel bg + staggered headline; What-is + 7 journey words; editorial image collage w/ parallax; The Bid stylized moment (illustrative, no real state); NFT flow w/ Model-B-honest copy; Transparency count-up 97.5/2.5; Shipping journey w/ traveling package dot (desktop) + carriers list; Payment escrow flow; Monad strip; Final CTA). Motion system: lib/motion.js (Reveal/IntersectionObserver variants, useParallax rAF transform-only disabled <768px, useCountUp) + .rv CSS; prefers-reduced-motion respected. Nav: Explore → auth modal w/ returnTo live listing. Verified: no auction grid on landing, no settle CTA, authed→Home intact, zero overflow 360/390/1440, build PASS 56.74s. Home/Discover + all logic untouched.
  - **Phase Polish 1 — Landing Page: ✅ PASS** (2026-09-21): NEW pages/Landing.jsx (hero 'WHERE BIDS COME ALIVE.', SocialFlow 7 steps, LIVE AUCTIONS = embedded existing LiveAuctionsSection unchanged incl. polished EmptyState, AuctionTypes PHYSICAL/NFT with Model B flow intact, Trust + fee panel, HowPreview, MonadStrip, FinalCta, footer variant) + LandingNav (Explore/How It Works/About + Log In/Get Started via openAuthModal) + App.js LandingGate on '/' (isLoading splash → isAuthed ? Home : Landing — auth routing preserved) + Home scroll #how-it-works + bz-rise animation (reduced-motion safe). Reuses: HeroVisual (exported), Footer variant, openAuthModal, LiveAuctionsSection, all routes. Validation: build PASS ×2, logged-out landing testid-verified, authed users still get Home, auth modal opens, ZERO overflow at 360/390/430/768/1024/1440, no logic/schema/contract/lifecycle changes.
- **Phase 6.5 — Deployment: ✅ BidzoneAuction live on Monad Testnet** (chain 10143): contract 0x05fE75cdC84deA944966D15c25c6633C03048EB5, treasury 0x0F45ebc33c82cf4bc940379de10d111F3beBb88c, FEE_BPS 250. Read-only on-chain checks verified.
- **SECURITY + PROFILE phase: ✅ PASS** (auth guards, wallet identity, RLS audit, withdraw, /profile — 12/12 + full security matrix).
- **AUTH + MOBILE/UI phase: ✅ PASS** (2026-09-20): mobile top-clipping ROOT CAUSE fixed (backdrop-filter on <header> created a containing block that collapsed the fixed MobileNav drawer to the header box — drawer now rendered outside the header); reactions + comments auth WIRED to existing tables/RLS/realtime (authenticated toggle/submit + persistence, unauthenticated get the Google sign-in modal — no silent failures, no anonymous rows); functional navigation (Live Zone/Explore/categories now filter the Home live listing via ?tab/?category, Profile+Wallet added to mobile drawer, honest coming-soon states for search/Bell/socials); lint 0 issues + build PASS; regression 10/10 by testing agent. Out of scope kept out: Physical Auction, contract/RLS/escrow changes.
- **Create Auction UI polish: ✅ PASS** (2026-09-20): `bz-input` was an undefined class (native white inputs) — now defined in index.css (near-black bg, white text, gray placeholder, purple focus ring, dark selects with custom chevron + dark option list); short numeric fields (Starting Bid / Min Increment / Anti-Sniping / Duration) compacted to sm:w-40/w-44; Title/Description stay wide; zero logic changes; verified desktop + 360px mobile (0 overflow), lint + build PASS.
- **Phase 7 Physical Auction: ✅ PASS** (2026-09-21): full physical flow end-to-end on EXISTING architecture — additive migration only (auctions.shipping_origin + addresses_select_fulfillment_seller RLS policy + tg_require_physical_address bid gate trigger); NEW frontend: physical fields in CreateAuction (origin/destinations/72h note), PHYSICAL badge + Shipping row in Auction Room, physical bid gate (no address → blocked + AddressModal), My Activity (Purchases/Sales/Bids) in Profile with full fulfillment ladder (payment secured → address → shipped (carrier+tracking, TRACKING_REQUIRED guard) → delivered → 48h window → confirm/dispute → release/refund) + 2.5/97.5 fee breakdown; backend service-role routes (fund stamp + tracking) with JWT+party verification (503-honest until service key — indexer write-back stays a backlog item); E2E verified live incl. edge cases A/B/D/L/M/N/O, anti-sniping (+10s replace), 48h-from-DELIVERED-only, dispute freeze + RESOLVED_BUYER refund, reputation events, notification chain; testing agent PASS. Physical Auction COMPLETE.
- **Phase 7.2 NFT Auction: ✅ COMPLETE** (code + chain + UI E2E; 2026-09-21):
  - RESUME NOTE (2026-09-21, restore #3, pod 2d54c564): envs re-created (14 REACT_APP_* incl. NFT set), services up, preview serves LIVE 7.2 bundle (md5==localhost) at stable origin https://advance-tasks.preview.emergentagent.com. Privy unblock chain: user added BOTH origins to allowlist (frame-ancestors verified) + Privy 429 rate-limit cooldown + modal lives in MAIN frame (scan page.frames, button "Approve"/"All Done").
  - **T11 FINAL VERIFICATION (2026-09-21, REAL MON)**: register (tx 0xff229582..., gas 0.011041, DB keccak-id sync) → sellerc bid 0.01 escrowed → sellerb outbid 0.02 at T-8s → ANTI-SNIPE: end_time = bid+10.000000s EXACT (DB+contract agree, no stacking) → cron closed after extended end → winner banner sellerb 0.02 → RefundPanel visible on ENDED (prior bug fix verified; claim honestly blocked by 0.0072 MON gas balance) → settle: statusOf=4 Settled, treasury +0.0005 = EXACT 2.5%, seller +97.5%. Regression 13/13 (physical/mobile/honest-wallet/profile), build PASS 96s. Phase 7.2 CLOSED.
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
