/* eslint-disable no-console */
const { ethers, network } = require("hardhat");
const { readFileSync, writeFileSync, existsSync } = require("fs");
require("dotenv").config();

/**
 * BIDZONE Phase 7.2 — NFT contracts deployment (Monad Testnet ONLY).
 *
 * Deploys, in order:
 *   1. BidzoneNFT       — ERC-721 collection (mint-to-self, capped)
 *   2. BidzoneNFTEscrow — NFT auction escrow (pull-refunds, anti-sniping,
 *                         atomic settlement: NFT->winner, 97.5%/2.5%)
 *
 * REUSES the SAME treasury + deployer key workflow as Phase 6.5
 * (BidzoneAuction is NOT touched and NOT redeployed).
 *
 * Usage: from /app/contracts/bidzone with .env containing
 *   DEPLOYER_PRIVATE_KEY=...   (user-only secret, never printed)
 *   BIDZONE_TREASURY_ADDRESS=0x...
 *   npm run deploy:nft
 */

async function main() {
    const treasuryEnv = (process.env.BIDZONE_TREASURY_ADDRESS || "").trim();
    if (!treasuryEnv) {
        throw new Error("BIDZONE_TREASURY_ADDRESS is required. Set it in .env.");
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(treasuryEnv)) {
        throw new Error("BIDZONE_TREASURY_ADDRESS is not a valid EVM address.");
    }

    const [deployer] = await ethers.getSigners();
    if (!deployer) {
        throw new Error("No deployer signer. Set DEPLOYER_PRIVATE_KEY in .env.");
    }
    if (treasuryEnv.toLowerCase() === deployer.address.toLowerCase()) {
        throw new Error("Treasury must not equal the deployer address.");
    }

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("--- BIDZONE Phase 7.2 NFT deployment ---");
    console.log("Network         :", network.name, "(chainId=" + Number((await ethers.provider.getNetwork()).chainId) + ")");
    console.log("Deployer address:", deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "MON");
    if (balance === 0n) {
        throw new Error("Deployer balance is zero — fund it from the Monad testnet faucet first.");
    }

    console.log("Deploying BidzoneNFT…");
    const NFT = await ethers.getContractFactory("BidzoneNFT");
    const nft = await NFT.deploy("Bidzone NFT", "BZNFT", 100000, deployer.address);
    const nftRcpt = await nft.deploymentTransaction().wait();
    const nftAddr = await nft.getAddress();
    console.log("✅ BidzoneNFT        :", nftAddr, "tx:", nftRcpt.hash, "block:", nftRcpt.blockNumber);

    console.log("Deploying BidzoneNFTEscrow…");
    const ESC = await ethers.getContractFactory("BidzoneNFTEscrow");
    const escrow = await ESC.deploy(treasuryEnv);
    const escRcpt = await escrow.deploymentTransaction().wait();
    const escAddr = await escrow.getAddress();
    console.log("✅ BidzoneNFTEscrow  :", escAddr, "tx:", escRcpt.hash, "block:", escRcpt.blockNumber);

    console.log("");
    console.log("Treasury (on-chain escrow):", await escrow.treasury());
    console.log("");
    console.log("Next steps:");
    console.log("  1) Set in /app/frontend/.env:");
    console.log("       REACT_APP_NFT_CONTRACT_ADDRESS=" + nftAddr);
    console.log("       REACT_APP_NFT_ESCROW_ADDRESS=" + escAddr);
    console.log("  2) Apply supabase/migrations/20260204000002_bidzone_nft.sql (SQL Editor).");
    console.log("  3) sudo supervisorctl restart frontend");

    // Best-effort: append to frontend/.env if present (never overwrites keys).
    const envPath = "/app/frontend/.env";
    try {
        if (existsSync(envPath)) {
            let env = readFileSync(envPath, "utf8");
            if (!/^REACT_APP_NFT_CONTRACT_ADDRESS=/m.test(env)) {
                env += `REACT_APP_NFT_CONTRACT_ADDRESS=${nftAddr}\n`;
            }
            if (!/^REACT_APP_NFT_ESCROW_ADDRESS=/m.test(env)) {
                env += `REACT_APP_NFT_ESCROW_ADDRESS=${escAddr}\n`;
            }
            writeFileSync(envPath, env);
            console.log("  (frontend/.env updated with the two addresses)");
        }
    } catch (e) {
        console.log("  Could not auto-update frontend/.env:", e.message);
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
