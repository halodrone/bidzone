# BIDZONE — Phase 6.5 Smart Contract (Monad Testnet)

On-chain auction escrow contract, tests, and deployment script.

## Layout
- `contracts/BidzoneAuction.sol` — the main contract
- `contracts/test/ReentrantBidder.sol` — reentrancy attack helper (test-only)
- `test/BidzoneAuction.test.js` — 29 rule/behavior checks
- `test/Reentrancy.test.js` — 1 reentrancy protection check
- `scripts/deploy.js` — production-grade Monad Testnet deployer
- `hardhat.config.js` — env-driven Monad Testnet config
- `.env.example` — copy → `.env` locally on your machine, never commit

## Local unit tests
```bash
cd /app/contracts/bidzone
npm install
npm test
```
Expected: **30 passing** in ~0.6s.

## Fee model (immutable)
- `FEE_BPS = 250` (2.50%)
- On a winning bid of `X`:
  - buyer pays exactly `X`  (no buyer premium)
  - seller receives `X * 9750 / 10000` (97.5%)
  - treasury receives `X * 250 / 10000` (2.5%)

## Anti-sniping
Within the last `antiSnipeSeconds` window, a valid bid REPLACES `endTime`
with `block.timestamp + antiSnipeSeconds`. Multiple bids do NOT stack.

## Deployment (you run this on YOUR machine)
1. `cp .env.example .env`
2. Edit `.env`:
   - `DEPLOYER_PRIVATE_KEY=0x…` (testnet-only key, never committed, never pasted in chat)
   - `BIDZONE_TREASURY_ADDRESS=0x…` (public address only — receives the 2.5% fee)
3. Fund the deployer address at https://faucet.monad.xyz (or your preferred Monad testnet faucet).
4. Run:
   ```bash
   npm run deploy:monad
   ```
5. The script prints:
   - `Contract address` — copy this
   - `Transaction hash`
   - `Block number`
6. In `/app/frontend/.env`, set:
   ```
   REACT_APP_MONAD_CONTRACT_ADDRESS=<address from step 5>
   REACT_APP_BIDZONE_TREASURY_ADDRESS=<treasury address you used>
   ```
7. Restart the frontend:
   ```bash
   sudo supervisorctl restart frontend
   ```

## Security rails
- Deploy script refuses to run if `BIDZONE_TREASURY_ADDRESS` is empty.
- Deploy script refuses to run if treasury == deployer.
- No private keys are ever read outside `hardhat.config.js` (env → runtime),
  never printed by the deploy script.
- `.env` is gitignored.
