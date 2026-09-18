/* eslint-disable no-console */
const { ethers, network } = require("hardhat");
require("dotenv").config();

/**
 * BIDZONE Phase 6.5 — Monad Testnet deployment script.
 *
 * Usage (from /app/contracts/bidzone/):
 *   cp .env.example .env
 *   # edit .env  → set DEPLOYER_PRIVATE_KEY  and  BIDZONE_TREASURY_ADDRESS
 *   npx hardhat run scripts/deploy.js --network monadTestnet
 *
 * SAFETY:
 * - The deployer private key MUST come from a local .env only. It is never
 *   committed and never printed by this script.
 * - The script REFUSES to run if BIDZONE_TREASURY_ADDRESS is empty or equal
 *   to the deployer address (no deployer-as-treasury fallback).
 * - Prints the contract address, transaction hash and block number so you
 *   can hand them back to the app configuration.
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
        throw new Error(
            "Treasury must not equal the deployer address. Set a dedicated BIDZONE treasury address."
        );
    }

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("--- BIDZONE Phase 6.5 deployment ---");
    console.log("Network         :", network.name, "(chainId=" + Number((await ethers.provider.getNetwork()).chainId) + ")");
    console.log("Deployer address:", deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "MON");
    console.log("Treasury address:", treasuryEnv);
    if (balance === 0n) {
        throw new Error("Deployer balance is zero — fund it from the Monad testnet faucet first.");
    }

    const F = await ethers.getContractFactory("BidzoneAuction");
    console.log("Deploying BidzoneAuction…");
    const contract = await F.deploy(treasuryEnv);
    const rcpt = await contract.deploymentTransaction().wait();
    const addr = await contract.getAddress();

    console.log("");
    console.log("✅ Deployed");
    console.log("Contract address :", addr);
    console.log("Transaction hash :", rcpt.hash);
    console.log("Block number     :", rcpt.blockNumber);
    console.log("Gas used         :", rcpt.gasUsed.toString());
    console.log("FEE_BPS          :", (await contract.FEE_BPS()).toString(), "( = 2.50% )");
    console.log("Treasury (on-chain):", await contract.treasury());
    console.log("");
    console.log("Next steps:");
    console.log("  1) Set in /app/frontend/.env:");
    console.log("       REACT_APP_MONAD_CONTRACT_ADDRESS=" + addr);
    console.log("       REACT_APP_BIDZONE_TREASURY_ADDRESS=" + treasuryEnv);
    console.log("  2) sudo supervisorctl restart frontend");
    console.log("  3) Fund test wallets on the Monad testnet faucet.");
    console.log("");
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
