const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * BIDZONE Phase 7.2 FINAL — Model B: EXISTING ERC-721 ownership + auction.
 * Proves BidzoneNFTEscrow escrows/auctions/settles ANY standard ERC-721
 * (not only BidzoneNFT), with full security guarantees intact.
 */
describe("BidzoneNFTEscrow — Model B (arbitrary ERC-721)", function () {
    let escrow, treasury, seller, bidderA, bidderB, other;
    let mock, mock2, nft; // nft = BidzoneNFT (regression: still works)
    const START = ethers.parseEther("0.05");
    const INC = ethers.parseEther("0.01");
    const HOUR = 3600;

    beforeEach(async function () {
        [treasury, seller, bidderA, bidderB, other] = await ethers.getSigners();
        const ESC = await ethers.getContractFactory("BidzoneNFTEscrow");
        escrow = await ESC.deploy(treasury.address);
        await escrow.waitForDeployment();
        const MOCK = await ethers.getContractFactory("MockERC721");
        mock = await MOCK.deploy();
        await mock.waitForDeployment();
        mock2 = await MOCK.deploy();
        await mock2.waitForDeployment();
        const NFT = await ethers.getContractFactory("BidzoneNFT");
        nft = await NFT.deploy("Bidzone Test", "BZNFT", 1000, treasury.address);
        await nft.waitForDeployment();
    });

    const escAddr = () => escrow.getAddress();
    const mockAddr = () => mock.getAddress();

    async function endFromNow(seconds) {
        return BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(seconds);
    }

    /** Mint `to` on the mock collection, approve escrow, register. */
    async function listToken({ collection = null, tokenId = null, sellerSigner = seller, start = START, inc = INC, duration = HOUR, skipApprove = false } = {}) {
        const c = collection || mock;
        let id = tokenId;
        if (id === null) {
            const tx = await c.connect(sellerSigner).mint(sellerSigner.address);
            const rc = await tx.wait();
            const ev = rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Transfer");
            id = ev.args.tokenId;
        }
        if (!skipApprove) await c.connect(sellerSigner).approve(await escAddr(), id);
        const end = await endFromNow(duration);
        await escrow.connect(sellerSigner).registerAuction(await c.getAddress(), id, start, inc, end, 10);
        return { id, end };
    }

    /* ---------------------- ARBITRARY COLLECTION SUPPORT ------------------- */
    it("escrows + auctions an arbitrary ERC-721 (MockERC721) end-to-end", async function () {
        const { id } = await listToken({});
        expect(await mock.ownerOf(id)).to.equal(await escAddr()); // escrow holds it
        const l = await escrow.listing(await mockAddr(), id);
        expect(l.seller).to.equal(seller.address);
        expect(l.status).to.equal(1n); // Live

        await escrow.connect(bidderA).placeBid(await mockAddr(), id, { value: START });
        const treBefore = await ethers.provider.getBalance(treasury.address);
        const selBefore = await ethers.provider.getBalance(seller.address);
        await escrow.connect(bidderB).placeBid(await mockAddr(), id, { value: START + INC });
        await escrow.connect(bidderA).claimRefund(await mockAddr(), id); // losing refund works on arbitrary collection
        await network.provider.send("evm_setNextBlockTimestamp", [Number(l.endTime) + 1]);
        await escrow.connect(other).settle(await mockAddr(), id); // permissionless
        expect(await mock.ownerOf(id)).to.equal(bidderB.address); // NFT -> winner
        const treAfter = await ethers.provider.getBalance(treasury.address);
        const selAfter = await ethers.provider.getBalance(seller.address);
        expect(treAfter - treBefore).to.equal(((START + INC) * 250n) / 10000n); // 2.5%
        expect(selAfter - selBefore).to.equal((START + INC) - (((START + INC) * 250n) / 10000n)); // 97.5%
    });

    it("rejects listing by a non-owner (owner-only listing)", async function () {
        await mock.connect(seller).mint(seller.address);
        // other tries to list seller's token
        await expect(
            escrow.connect(other).registerAuction(await mockAddr(), 1n, START, INC, await endFromNow(HOUR), 10)
        ).to.be.revertedWithCustomError(escrow, "BZNotSeller");
    });

    it("rejects listing without approval (approval required)", async function () {
        await mock.connect(seller).mint(seller.address);
        await expect(
            escrow.connect(seller).registerAuction(await mockAddr(), 1n, START, INC, await endFromNow(HOUR), 10)
        ).to.be.reverted; // ERC721 insufficient-approval (transferFrom reverts)
        // after approving, listing succeeds
        await mock.connect(seller).approve(await escAddr(), 1n);
        await escrow.connect(seller).registerAuction(await mockAddr(), 1n, START, INC, await endFromNow(HOUR), 10);
        expect(await mock.ownerOf(1n)).to.equal(await escAddr());
    });

    it("rejects listing a non-existent token", async function () {
        await expect(
            escrow.connect(seller).registerAuction(await mockAddr(), 999n, START, INC, await endFromNow(HOUR), 10)
        ).to.be.reverted; // ownerOf reverts on non-existent token
    });

    it("prevents double escrow of the same (collection, tokenId)", async function () {
        await listToken({});
        await expect(
            escrow.connect(seller).registerAuction(await mockAddr(), 1n, START, INC, await endFromNow(HOUR), 10)
        ).to.be.revertedWithCustomError(escrow, "BZNotActive");
    });

    it("allows the SAME tokenId on two DIFFERENT collections (independent listings)", async function () {
        await listToken({}); // mock token 1
        await mock2.connect(seller).mint(seller.address);
        await mock2.connect(seller).approve(await escAddr(), 1n);
        await escrow.connect(seller).registerAuction(await mock2.getAddress(), 1n, START, INC, await endFromNow(HOUR), 10);
        expect((await escrow.listing(await mockAddr(), 1n)).status).to.equal(1n);
        expect((await escrow.listing(await mock2.getAddress(), 1n)).status).to.equal(1n);
    });

    it("setApprovalForAll works as authorization for escrow registration", async function () {
        await mock.connect(seller).mint(seller.address);
        await mock.connect(seller).setApprovalForAll(await escAddr(), true);
        await escrow.connect(seller).registerAuction(await mockAddr(), 1n, START, INC, await endFromNow(HOUR), 10);
        expect(await mock.ownerOf(1n)).to.equal(await escAddr());
    });

    it("escrowed NFT cannot be moved by anyone (no seizure, no double transfer)", async function () {
        await listToken({});
        await expect(mock.connect(seller).transferFrom(await escAddr(), seller.address, 1n)).to.be.reverted; // escrow owns it; escrow doesn't move it
        await expect(mock.connect(other).transferFrom(await escAddr(), other.address, 1n)).to.be.reverted;
    });

    it("cancel returns the NFT to the seller when there are no bids (arbitrary collection)", async function () {
        const { id } = await listToken({});
        await escrow.connect(seller).cancelAuction(await mockAddr(), id);
        expect(await mock.ownerOf(id)).to.equal(seller.address);
        expect((await escrow.listing(await mockAddr(), id)).status).to.equal(4n); // Cancelled
        // relist after cancel is allowed
        await listToken({ tokenId: id });
        expect((await escrow.listing(await mockAddr(), id)).status).to.equal(1n);
    });

    it(" BidzoneNFT regression: bid/outbid/refund/settle still work identically", async function () {
        await nft.connect(seller).mint("https://metadata.example/1");
        await nft.connect(seller).approve(await escAddr(), 1n);
        const end = await endFromNow(HOUR);
        await escrow.connect(seller).registerAuction(await nft.getAddress(), 1n, START, INC, end, 10);
        await escrow.connect(bidderA).placeBid(await nft.getAddress(), 1n, { value: START });
        await escrow.connect(bidderB).placeBid(await nft.getAddress(), 1n, { value: START + INC });
        await network.provider.send("evm_setNextBlockTimestamp", [Number(end) + 1]);
        await escrow.connect(bidderB).settle(await nft.getAddress(), 1n);
        expect(await nft.ownerOf(1n)).to.equal(bidderB.address);
    });

    it("settle cannot run twice (idempotent) — arbitrary collection", async function () {
        const { id, end } = await listToken({});
        await escrow.connect(bidderA).placeBid(await mockAddr(), id, { value: START });
        await network.provider.send("evm_setNextBlockTimestamp", [Number(end) + 1]);
        await escrow.connect(other).settle(await mockAddr(), id);
        await expect(escrow.connect(other).settle(await mockAddr(), id)).to.be.revertedWithCustomError(escrow, "BZAlreadySettled");
        // NFT moved exactly once
        expect(await mock.ownerOf(id)).to.equal(bidderA.address);
    });

    it("ownerOf after settlement is the winner — collection UX ground truth", async function () {
        const { id, end } = await listToken({});
        await escrow.connect(bidderB).placeBid(await mockAddr(), id, { value: START });
        await network.provider.send("evm_setNextBlockTimestamp", [Number(end) + 1]);
        await escrow.connect(bidderB).settle(await mockAddr(), id);
        expect(await mock.ownerOf(id)).to.equal(bidderB.address);
        expect(await mock.balanceOf(await escAddr())).to.equal(0n);
    });

    it("below-minimum bid and self-bid rejected on arbitrary collection", async function () {
        const { id } = await listToken({});
        await escrow.connect(bidderA).placeBid(await mockAddr(), id, { value: START });
        await expect(escrow.connect(bidderB).placeBid(await mockAddr(), id, { value: START })).to.be.revertedWithCustomError(escrow, "BZBelowMinimum");
        await expect(escrow.connect(seller).placeBid(await mockAddr(), id, { value: START + INC })).to.be.revertedWithCustomError(escrow, "BZSelfBid");
    });
});
