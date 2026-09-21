const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * BIDZONE Phase 7.2 — BidzoneNFT + BidzoneNFTEscrow test suite.
 * Runs on the in-process hardhat network (no private keys required).
 */
describe("BidzoneNFT + BidzoneNFTEscrow", function () {
    let nft, escrow, treasury, seller, bidderA, bidderB, other;
    const START = ethers.parseEther("0.05");
    const INC = ethers.parseEther("0.01");
    const DAY = 86400;

    beforeEach(async function () {
        [treasury, seller, bidderA, bidderB, other] = await ethers.getSigners();
        const NFT = await ethers.getContractFactory("BidzoneNFT");
        nft = await NFT.deploy("Bidzone Test", "BZNFT", 1000, treasury.address);
        await nft.waitForDeployment();
        const ESC = await ethers.getContractFactory("BidzoneNFTEscrow");
        escrow = await ESC.deploy(treasury.address);
        await escrow.waitForDeployment();
    });

    async function mintToSeller(uri = "https://metadata.example/token/1") {
        await nft.connect(seller).mint(uri);
        return 1n; // sequential ids start at 1
    }

    async function escrowFromSeller(tokenId = 1n, start = START, inc = INC, duration = DAY) {
        const end = BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(duration);
        await nft.connect(seller).approve(await escrow.getAddress(), tokenId);
        await escrow.connect(seller).registerAuction(
            await nft.getAddress(), tokenId, start, inc, end, 10
        );
        return end;
    }

    /* ------------------------- MINT AUTHORIZATION ------------------------ */
    it("mints to the caller only (mint-to-self)", async function () {
        const id = await mintToSeller();
        expect(await nft.ownerOf(id)).to.equal(seller.address);
        expect(await nft.balanceOf(seller.address)).to.equal(1n);
        expect(await nft.tokenURI(id)).to.equal("https://metadata.example/token/1");
    });

    it("rejects empty tokenURI and enforces unique sequential ids", async function () {
        await expect(nft.connect(seller).mint("")).to.be.revertedWithCustomError(nft, "EmptyTokenURI");
        await nft.connect(seller).mint("uri-1");
        await nft.connect(seller).mint("uri-2");
        expect(await nft.ownerOf(1n)).to.equal(seller.address);
        expect(await nft.ownerOf(2n)).to.equal(seller.address);
        await expect(nft.ownerOf(3n)).to.be.reverted;
    });

    it("enforces supply cap and per-wallet mint cap (no unrestricted minting)", async function () {
        const NFT = await ethers.getContractFactory("BidzoneNFT");
        const tiny = await NFT.deploy("T", "T", 2, treasury.address);
        await tiny.connect(seller).mint("a");
        await tiny.connect(seller).mint("b");
        await expect(tiny.connect(seller).mint("c")).to.be.revertedWithCustomError(tiny, "MintCapReached");

        const cap = await NFT.deploy("W", "W", 1000, treasury.address);
        for (let i = 0; i < 100; i++) await cap.connect(other).mint(`u-${i}`);
        await expect(cap.connect(other).mint("over")).to.be.revertedWithCustomError(cap, "WalletMintCapReached");
    });

    it("supports ERC-721 interfaces + setApprovalForAll", async function () {
        expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
        await nft.connect(seller).setApprovalForAll(other.address, true);
        await nft.connect(other).transferFrom(seller.address, other.address, await mintToSeller());
        expect(await nft.ownerOf(1n)).to.equal(other.address);
    });

    /* ------------------------- ESCROW / REGISTRATION --------------------- */
    it("escrows the NFT into the contract on registration", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        expect(await nft.ownerOf(id)).to.equal(await escrow.getAddress());
        const l = await escrow.listing(await nft.getAddress(), id);
        expect(l.seller).to.equal(seller.address);
        expect(l.status).to.equal(1n); // Live
    });

    it("rejects registration without ownership or with bad params", async function () {
        const id = await mintToSeller();
        const end = BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(DAY);
        const escAddr = await escrow.getAddress();
        const nftAddr = await nft.getAddress();
        // not owner
        await expect(escrow.connect(bidderA).registerAuction(nftAddr, id, START, INC, end, 10))
            .to.be.revertedWithCustomError(escrow, "BZNotSeller");
        // no approval
        await expect(escrow.connect(seller).registerAuction(nftAddr, id, START, INC, end, 10))
            .to.be.reverted; // ERC721 insufficient approval on transferFrom
        // invalid NFT address
        await nft.connect(seller).approve(escAddr, id);
        await expect(escrow.connect(seller).registerAuction(ethers.ZeroAddress, id, START, INC, end, 10))
            .to.be.revertedWithCustomError(escrow, "BZNFTZero");
        // past end / zero bids / snipe out of range
        await expect(escrow.connect(seller).registerAuction(nftAddr, id, 0, INC, end, 10))
            .to.be.revertedWithCustomError(escrow, "BZStartingBidZero");
        await expect(escrow.connect(seller).registerAuction(nftAddr, id, START, 0, end, 10))
            .to.be.revertedWithCustomError(escrow, "BZIncrementZero");
        const past = BigInt((await ethers.provider.getBlock("latest")).timestamp) - 10n;
        await expect(escrow.connect(seller).registerAuction(nftAddr, id, START, INC, past, 10))
            .to.be.revertedWithCustomError(escrow, "BZEndPast");
        await expect(escrow.connect(seller).registerAuction(nftAddr, id, START, INC, end, 0))
            .to.be.revertedWithCustomError(escrow, "BZSnipeRange");
    });

    it("prevents double listing of the same token while active", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        // seller still owns nothing; second registration impossible even with
        // a second token approval — the listing is active.
        const end = BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(DAY);
        await expect(escrow.connect(seller).registerAuction(
            await nft.getAddress(), 1n, START, INC, end, 10
        )).to.be.revertedWithCustomError(escrow, "BZNotActive");
    });

    it("prevents unauthorized transfer of an escrowed NFT (even by seller)", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        await expect(nft.connect(seller).transferFrom(seller.address, other.address, id))
            .to.be.reverted; // seller no longer owns / no approval
        await expect(nft.connect(seller).transferFrom(await escrow.getAddress(), other.address, id))
            .to.be.reverted; // escrow contract is owner; seller cannot move it
    });

    /* ------------------------------ BIDDING ------------------------------ */
    it("accepts valid bids and rejects below-minimum / self-bid / after-end", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        const nftAddr = await nft.getAddress();

        await expect(escrow.connect(bidderA).placeBid(nftAddr, id, { value: START - 1n }))
            .to.be.revertedWithCustomError(escrow, "BZBelowMinimum");
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START }); // first = starting
        await expect(escrow.connect(seller).placeBid(nftAddr, id, { value: START + INC }))
            .to.be.revertedWithCustomError(escrow, "BZSelfBid");
        await escrow.connect(bidderB).placeBid(nftAddr, id, { value: START + INC });
        await expect(escrow.connect(bidderB).placeBid(nftAddr, id, { value: START + INC }))
            .to.be.revertedWithCustomError(escrow, "BZBelowMinimum");

        // after end
        await network.provider.send("evm_increaseTime", [DAY + 10]);
        await network.provider.send("evm_mine");
        await expect(escrow.connect(bidderA).placeBid(nftAddr, id, { value: START + 2n * INC }))
            .to.be.revertedWithCustomError(escrow, "BZNotEnded");
    });

    it("queues pull-refunds for outbid bidders and pays them", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        const nftAddr = await nft.getAddress();
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START });
        await escrow.connect(bidderB).placeBid(nftAddr, id, { value: START + INC });

        const refund = await escrow.refundOf(nftAddr, id, bidderA.address);
        expect(refund).to.equal(START);
        const before = await ethers.provider.getBalance(bidderA.address);
        await escrow.connect(bidderA).claimRefund(nftAddr, id);
        const after = await ethers.provider.getBalance(bidderA.address);
        expect(after > before).to.equal(true);
        await expect(escrow.connect(bidderA).claimRefund(nftAddr, id))
            .to.be.revertedWithCustomError(escrow, "BZNoRefund");
    });

    it("anti-sniping: extends to exactly +window, no stacking", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        const nftAddr = await nft.getAddress();
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START });

        // advance into the final 10s window
        await network.provider.send("evm_increaseTime", [DAY - 5]);
        await network.provider.send("evm_mine");
        const tx1 = await escrow.connect(bidderB).placeBid(nftAddr, id, { value: START + INC });
        await tx1.wait();
        const l1 = await escrow.listing(nftAddr, id);
        const block1 = await ethers.provider.getBlock("latest");
        expect(Number(l1.endTime) - block1.timestamp).to.equal(10);

        // second bid inside the new window REPLACES (no stacking)
        await network.provider.send("evm_increaseTime", [7]);
        await network.provider.send("evm_mine");
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START + 2n * INC });
        const l2 = await escrow.listing(nftAddr, id);
        const block2 = await ethers.provider.getBlock("latest");
        expect(Number(l2.endTime) - block2.timestamp).to.equal(10);
    });

    /* ------------------------ SETTLEMENT / WINNER ------------------------ */
    it("settles: NFT to winner, 97.5% seller, 2.5% treasury; idempotent", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        const nftAddr = await nft.getAddress();
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START });
        await escrow.connect(bidderB).placeBid(nftAddr, id, { value: START + INC });

        // not ended yet
        await expect(escrow.connect(other).settle(nftAddr, id))
            .to.be.revertedWithCustomError(escrow, "BZNotEnded");

        await network.provider.send("evm_increaseTime", [DAY + 5]);
        await network.provider.send("evm_mine");

        const sellerBefore = await ethers.provider.getBalance(seller.address);
        const treasuryBefore = await ethers.provider.getBalance(treasury.address);
        await escrow.connect(other).settle(nftAddr, id); // permissionless

        expect(await nft.ownerOf(id)).to.equal(bidderB.address); // NFT -> winner
        const sellerAfter = await ethers.provider.getBalance(seller.address);
        const treasuryAfter = await ethers.provider.getBalance(treasury.address);
        const fee = (START + INC) * 250n / 10000n;
        expect(sellerAfter - sellerBefore).to.equal(START + INC - fee);
        expect(treasuryAfter - treasuryBefore).to.equal(fee);

        // duplicate settlement reverts
        await expect(escrow.connect(other).settle(nftAddr, id))
            .to.be.revertedWithCustomError(escrow, "BZAlreadySettled");

        // winner can send the NFT onward (ownership after transfer)
        await nft.connect(bidderB).transferFrom(bidderB.address, other.address, id);
        expect(await nft.ownerOf(id)).to.equal(other.address);
    });

    it("no-sale: nothing settles without a winner; seller reclaims via cancel", async function () {
        const nftAddr = await nft.getAddress();

        // seller cannot cancel AFTER a bid exists -> has-bids guard first
        const id = await mintToSeller();
        await escrowFromSeller(id);
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START });
        await expect(escrow.connect(seller).cancelAuction(nftAddr, id))
            .to.be.revertedWithCustomError(escrow, "BZHasBids");

        // fresh auction: cancel with no bids returns the NFT
        const id2 = (await nft.nextTokenId()) + 1n;
        await nft.connect(seller).mint("second");
        await escrowFromSeller(id2);
        await escrow.connect(seller).cancelAuction(nftAddr, id2);
        expect(await nft.ownerOf(id2)).to.equal(seller.address);

        // settle with no winner: NFT stays escrowed, seller can still reclaim
        const id3 = (await nft.nextTokenId()) + 1n;
        await nft.connect(seller).mint("third");
        await escrowFromSeller(id3);
        await network.provider.send("evm_increaseTime", [DAY + 5]);
        await network.provider.send("evm_mine");
        await escrow.connect(other).settle(nftAddr, id3); // no-sale settle
        const l = await escrow.listing(nftAddr, id3);
        expect(l.status).to.equal(3n); // Settled
        expect(await nft.ownerOf(id3)).to.equal(await escrow.getAddress());
        await escrow.connect(seller).cancelAuction(nftAddr, id3); // no-sale reclaim
        expect(await nft.ownerOf(id3)).to.equal(seller.address);
    });

    it("seller cannot reclaim an escrowed NFT that has bids (core escrow guarantee)", async function () {
        const id = await mintToSeller();
        await escrowFromSeller(id);
        const nftAddr = await nft.getAddress();
        await escrow.connect(bidderA).placeBid(nftAddr, id, { value: START });
        // even after end, cancel is impossible with bids
        await network.provider.send("evm_increaseTime", [DAY + 5]);
        await network.provider.send("evm_mine");
        await expect(escrow.connect(seller).cancelAuction(nftAddr, id))
            .to.be.revertedWithCustomError(escrow, "BZHasBids");
        // only settle (to the winner) releases it
        await escrow.connect(other).settle(nftAddr, id);
        expect(await nft.ownerOf(id)).to.equal(bidderA.address);
    });
});
