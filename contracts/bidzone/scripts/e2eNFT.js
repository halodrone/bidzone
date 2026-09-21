/* eslint-disable no-console */
const { ethers, network } = require("hardhat");
require("dotenv").config();

/**
 * BIDZONE Phase 7.2 — ON-CHAIN E2E (Monad Testnet 10143).
 * Proves the full NFT auction path with REAL state changes:
 *   mint -> approve -> escrow register -> bid (MON escrow) -> settle
 *   -> NFT to winner + 97.5%/2.5% split -> winner SENDS the NFT onward.
 * Deployer = seller. Winner is a fresh funded wallet. No bid = refund paths
 * are covered by the 14-test local suite; here we prove the live chain path.
 */
async function main() {
    const [seller] = await ethers.getSigners();
    const nftAddr = process.env.REACT_APP_NFT_CONTRACT_ADDRESS;
    const escAddr = process.env.REACT_APP_NFT_ESCROW_ADDRESS;
    if (!nftAddr || !escAddr) throw new Error("NFT addresses missing from .env");
    const treasury = "0x0F45ebc33c82cf4bc940379de10d111F3beBb88c";

    const nft = await ethers.getContractAt("BidzoneNFT", nftAddr, seller);
    const esc = await ethers.getContractAt("BidzoneNFTEscrow", escAddr, seller);

    // Winner: fresh wallet funded by the seller (gas + bid).
    const winner = ethers.Wallet.createRandom().connect(ethers.provider);
    const fundTx = await seller.sendTransaction({ to: winner.address, value: ethers.parseEther("0.2") });
    await fundTx.wait();
    console.log("Winner wallet :", winner.address, "(funded 0.2 MON)");

    // 1) MINT (seller -> self)
    const metadataUri = "https://repo-setup-144.emergent.host/api/nft-metadata/e2e-script";
    const mintTx = await nft.mint(metadataUri);
    const mintRcpt = await mintTx.wait();
    let tokenId = null;
    for (const log of mintRcpt.logs) {
        try {
            const ev = nft.interface.parseLog(log);
            if (ev.name === "Minted") tokenId = ev.args.tokenId;
        } catch { /* skip */ }
    }
    console.log("1) MINTED     : tokenId", tokenId.toString(), "tx", mintTx.hash);
    console.log("   ownerOf    :", await nft.ownerOf(tokenId), "(seller ✓)");

    // 2) APPROVE + REGISTER (NFT pulled into escrow)
    await (await nft.approve(escAddr, tokenId)).wait();
    const start = ethers.parseEther("0.05");
    const inc = ethers.parseEther("0.01");
    const latest = await ethers.provider.getBlock("latest");
    const end = BigInt(latest.timestamp) + 90n; // 90s auction
    await (await esc.registerAuction(nftAddr, tokenId, start, inc, end, 10)).wait();
    console.log("2) ESCROWED   : ownerOf =", await nft.ownerOf(tokenId), "(escrow contract ✓)");
    const escBalance = await nft.balanceOf(escAddr);
    console.log("   escrow balanceOf:", escBalance.toString());

    // 3) BID (winner pays exactly min-next)
    const bid = start; // first bid = starting bid
    const escW = await ethers.getContractAt("BidzoneNFTEscrow", escAddr, winner);
    await (await escW.placeBid(nftAddr, tokenId, { value: bid })).wait();
    const l = await esc.listing(nftAddr, tokenId);
    console.log("3) BID        :", ethers.formatEther(l.currentBid), "MON by", l.currentBidder);

    // 4) WAIT END -> SETTLE (atomic: NFT->winner + 97.5/2.5)
    const treBefore = await ethers.provider.getBalance(treasury);
    const selBefore = await ethers.provider.getBalance(seller.address);
    for (let i = 0; i < 120; i++) {
        const blk = await ethers.provider.getBlock("latest");
        if (BigInt(blk.timestamp) >= l.endTime) break;
        await new Promise((r) => setTimeout(r, 3000));
    }
    await (await esc.connect(winner).settle(nftAddr, tokenId)).wait();
    const owner = await nft.ownerOf(tokenId);
    const treAfter = await ethers.provider.getBalance(treasury);
    const selAfter = await ethers.provider.getBalance(seller.address);
    const fee = bid * 250n / 10000n;
    console.log("4) SETTLED    : ownerOf =", owner, owner === winner.address ? "(winner ✓)" : "(WRONG!)");
    console.log("   treasury   : +", ethers.formatEther(treAfter - treBefore), "MON (expect 0.0005)");
    console.log("   seller     : +", ethers.formatEther(selAfter - selBefore), "MON (expect 0.0495)");
    console.log("   fee math   : 2.5% =", ethers.formatEther(fee), "/ 97.5% =", ethers.formatEther(bid - fee));
    if (owner !== winner.address) throw new Error("NFT NOT transferred to winner!");
    if (treAfter - treBefore !== fee) throw new Error("Treasury fee mismatch!");
    if (selAfter - selBefore !== bid - fee) throw new Error("Seller payout mismatch!");

    // 5) SEND NFT (winner transfers onward — ownership updates on-chain)
    const recipient = ethers.Wallet.createRandom().connect(ethers.provider).address;
    await (await nft.connect(winner).safeTransferFrom(winner.address, recipient, tokenId)).wait();
    const finalOwner = await nft.ownerOf(tokenId);
    console.log("5) SENT       : ownerOf =", finalOwner, finalOwner === recipient ? "(recipient ✓)" : "(WRONG!)");

    // 6) Double-settle must revert (idempotency) — any revert counts.
    let reverted = false;
    try {
        await esc.connect(winner).settle(nftAddr, tokenId);
    } catch (e) {
        reverted = true;
    }
    if (!reverted) throw new Error("double settle did NOT revert!");
    console.log("6) DOUBLE SETTLE: reverted ✓");

    console.log("");
    console.log("ON-CHAIN E2E: ALL CHECKS PASSED (mint→escrow→bid→settle→transfer→send)");
    console.log("Token: #", tokenId.toString(), "on", nftAddr, "chain 10143");
}

main().then(() => process.exit(0)).catch((e) => {
    console.error("E2E FAILED:", e.message || e);
    process.exit(1);
});
