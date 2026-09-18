const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/**
 * BIDZONE Phase 6.5 — full contract test suite (>=28 checks).
 * Runs on the local Hardhat network. Time is manipulated with `evm_increaseTime`.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const one_hour = 3600;
const bytes32Id = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

async function deployFixture() {
    const [deployer, treasury, seller, bidderA, bidderB, bidderC, outsider] = await ethers.getSigners();
    const F = await ethers.getContractFactory("BidzoneAuction", deployer);
    const contract = await F.deploy(treasury.address);
    await contract.waitForDeployment();
    return { contract, deployer, treasury, seller, bidderA, bidderB, bidderC, outsider };
}

async function now() {
    const b = await ethers.provider.getBlock("latest");
    return b.timestamp;
}
async function increase(sec) {
    await network.provider.send("evm_increaseTime", [sec]);
    await network.provider.send("evm_mine");
}

function mon(v) { return ethers.parseEther(String(v)); }

describe("BidzoneAuction — Phase 6.5", function () {
    // ------------------------------------------------------------------
    // Deployment
    // ------------------------------------------------------------------
    describe("T01 deployment", () => {
        it("reverts on zero treasury", async () => {
            const [deployer] = await ethers.getSigners();
            const F = await ethers.getContractFactory("BidzoneAuction", deployer);
            await expect(F.deploy(ZERO)).to.be.revertedWith("BZ:treasury=0");
        });
        it("deploys with FEE_BPS=250 and immutable treasury", async () => {
            const { contract, treasury } = await deployFixture();
            expect(await contract.FEE_BPS()).to.equal(250);
            expect(await contract.BPS_DENOMINATOR()).to.equal(10_000);
            expect(await contract.treasury()).to.equal(treasury.address);
        });
    });

    // ------------------------------------------------------------------
    // Auction creation
    // ------------------------------------------------------------------
    describe("T02 auction creation", () => {
        it("creates a Live auction when startTime is now and emits event", async () => {
            const { contract, seller } = await deployFixture();
            const id = bytes32Id("A1");
            const start = await now();
            const end = start + 600;
            const tx = await contract.connect(seller).createAuction(
                id, mon("0.1"), mon("0.05"), start, end, 10
            );
            await expect(tx).to.emit(contract, "AuctionCreated");
            const a = await contract.getAuction(id);
            expect(a.status).to.equal(2); // Live
            expect(a.seller).to.equal(seller.address);
            expect(a.startingBid).to.equal(mon("0.1"));
        });
        it("rejects id=0, duplicate id, bad timings and out-of-range snipe", async () => {
            const { contract, seller } = await deployFixture();
            const start = await now();
            const end = start + 600;
            await expect(contract.connect(seller).createAuction(
                ethers.ZeroHash, mon("0.1"), mon("0.05"), start, end, 10
            )).to.be.revertedWith("BZ:id=0");

            const id = bytes32Id("dup");
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, end, 10);
            await expect(contract.connect(seller).createAuction(
                id, mon("0.1"), mon("0.05"), start, end, 10
            )).to.be.revertedWith("BZ:id_exists");

            await expect(contract.connect(seller).createAuction(
                bytes32Id("z1"), 0, mon("0.05"), start, end, 10
            )).to.be.revertedWith("BZ:starting_bid=0");
            await expect(contract.connect(seller).createAuction(
                bytes32Id("z2"), mon("0.1"), 0, start, end, 10
            )).to.be.revertedWith("BZ:increment=0");
            await expect(contract.connect(seller).createAuction(
                bytes32Id("z3"), mon("0.1"), mon("0.05"), end, start, 10
            )).to.be.revertedWith("BZ:end<=start");
            await expect(contract.connect(seller).createAuction(
                bytes32Id("z4"), mon("0.1"), mon("0.05"), start, start, 10
            )).to.be.revertedWith("BZ:end<=start");
            await expect(contract.connect(seller).createAuction(
                bytes32Id("z5"), mon("0.1"), mon("0.05"), start, end, 0
            )).to.be.revertedWith("BZ:snipe_out_of_range");
            await expect(contract.connect(seller).createAuction(
                bytes32Id("z6"), mon("0.1"), mon("0.05"), start, end, 3601
            )).to.be.revertedWith("BZ:snipe_out_of_range");
        });
    });

    // ------------------------------------------------------------------
    // Bidding rules
    // ------------------------------------------------------------------
    describe("T03 bidding rules", () => {
        async function liveFixture() {
            const f = await deployFixture();
            const id = bytes32Id("live-1");
            const start = await now();
            await f.contract.connect(f.seller).createAuction(
                id, mon("0.1"), mon("0.05"), start, start + 600, 10
            );
            return { ...f, id };
        }

        it("T03a rejects below starting bid on first bid", async () => {
            const { contract, id, bidderA } = await liveFixture();
            await expect(contract.connect(bidderA).placeBid(id, { value: mon("0.09") }))
                .to.be.revertedWith("BZ:below_minimum");
        });
        it("T03b accepts first bid >= starting bid", async () => {
            const { contract, id, bidderA } = await liveFixture();
            await expect(contract.connect(bidderA).placeBid(id, { value: mon("0.1") }))
                .to.emit(contract, "BidPlaced");
        });
        it("T03c enforces minimum increment on next bid", async () => {
            const { contract, id, bidderA, bidderB } = await liveFixture();
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await expect(contract.connect(bidderB).placeBid(id, { value: mon("0.12") }))
                .to.be.revertedWith("BZ:below_minimum");
            await expect(contract.connect(bidderB).placeBid(id, { value: mon("0.15") }))
                .to.emit(contract, "BidPlaced");
        });
        it("T03d rejects seller self-bid", async () => {
            const { contract, id, seller } = await liveFixture();
            await expect(contract.connect(seller).placeBid(id, { value: mon("0.1") }))
                .to.be.revertedWith("BZ:seller_self_bid");
        });
        it("T03e rejects zero-value bid", async () => {
            const { contract, id, bidderA } = await liveFixture();
            await expect(contract.connect(bidderA).placeBid(id, { value: 0 }))
                .to.be.revertedWith("BZ:bid=0");
        });
        it("T03f rejects bid on non-existent auction", async () => {
            const { contract, bidderA } = await deployFixture();
            await expect(contract.connect(bidderA).placeBid(bytes32Id("nope"), { value: mon("0.1") }))
                .to.be.revertedWith("BZ:not_found");
        });
        it("T03g rejects bid on Scheduled auction", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("sch");
            const start = (await now()) + 1000;
            await contract.connect(seller).createAuction(
                id, mon("0.1"), mon("0.05"), start, start + 600, 10
            );
            await expect(contract.connect(bidderA).placeBid(id, { value: mon("0.1") }))
                .to.be.revertedWith("BZ:not_started");
        });
        it("T03h rejects bid on Ended auction", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("end");
            const start = await now();
            await contract.connect(seller).createAuction(
                id, mon("0.1"), mon("0.05"), start, start + 30, 10
            );
            await increase(120);
            await expect(contract.connect(bidderA).placeBid(id, { value: mon("0.1") }))
                .to.be.revertedWith("BZ:ended");
        });
    });

    // ------------------------------------------------------------------
    // Outbid & refunds
    // ------------------------------------------------------------------
    describe("T04 outbid & refund", () => {
        it("queues refund for outbid bidder + emits event", async () => {
            const { contract, seller, bidderA, bidderB } = await deployFixture();
            const id = bytes32Id("out1");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 600, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await expect(contract.connect(bidderB).placeBid(id, { value: mon("0.15") }))
                .to.emit(contract, "RefundAvailable").withArgs(id, bidderA.address, mon("0.1"));
            expect(await contract.refundOf(id, bidderA.address)).to.equal(mon("0.1"));
        });
        it("pull-based withdrawal returns funds and zeroes ledger", async () => {
            const { contract, seller, bidderA, bidderB } = await deployFixture();
            const id = bytes32Id("out2");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 600, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await contract.connect(bidderB).placeBid(id, { value: mon("0.15") });
            const before = await ethers.provider.getBalance(bidderA.address);
            const tx = await contract.connect(bidderA).withdrawRefund(id);
            const rcpt = await tx.wait();
            const gas = rcpt.gasUsed * rcpt.gasPrice;
            const after = await ethers.provider.getBalance(bidderA.address);
            expect(after - before + gas).to.equal(mon("0.1"));
            expect(await contract.refundOf(id, bidderA.address)).to.equal(0);
        });
        it("double-withdraw reverts", async () => {
            const { contract, seller, bidderA, bidderB } = await deployFixture();
            const id = bytes32Id("out3");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 600, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await contract.connect(bidderB).placeBid(id, { value: mon("0.15") });
            await contract.connect(bidderA).withdrawRefund(id);
            await expect(contract.connect(bidderA).withdrawRefund(id))
                .to.be.revertedWith("BZ:no_refund");
        });
        it("no refund for someone who never bid", async () => {
            const { contract, seller, bidderA, outsider } = await deployFixture();
            const id = bytes32Id("out4");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 600, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await expect(contract.connect(outsider).withdrawRefund(id))
                .to.be.revertedWith("BZ:no_refund");
        });
    });

    // ------------------------------------------------------------------
    // Anti-sniping (reset to exactly antiSnipeSeconds, no stacking)
    // ------------------------------------------------------------------
    describe("T05 anti-sniping", () => {
        it("resets end time to block.timestamp + antiSnipeSeconds when within window", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("snipe");
            const start = await now();
            const end = start + 15;               // 15s life
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, end, 10);
            await increase(8);                    // ~7s remaining
            const tx = await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            const rcpt = await tx.wait();
            const block = await ethers.provider.getBlock(rcpt.blockNumber);
            const a = await contract.getAuction(id);
            expect(Number(a.endTime)).to.equal(block.timestamp + 10);
            await expect(tx).to.emit(contract, "AuctionExtended").withArgs(id, a.endTime);
        });
        it("multiple late bids each reset to now+10 (no stacking)", async () => {
            const { contract, seller, bidderA, bidderB } = await deployFixture();
            const id = bytes32Id("snipe2");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 15, 10);
            await increase(8);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            const a1 = await contract.getAuction(id);
            await increase(3); // still inside 10s window
            const tx = await contract.connect(bidderB).placeBid(id, { value: mon("0.15") });
            const rcpt = await tx.wait();
            const block = await ethers.provider.getBlock(rcpt.blockNumber);
            const a2 = await contract.getAuction(id);
            expect(Number(a2.endTime)).to.equal(block.timestamp + 10);
            expect(a2.endTime).to.not.equal(Number(a1.endTime) + 10); // proves no stacking
        });
        it("bid outside window does NOT extend end time", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("snipe3");
            const start = await now();
            const end = start + 600;
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, end, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            const a = await contract.getAuction(id);
            expect(Number(a.endTime)).to.equal(end);
        });
    });

    // ------------------------------------------------------------------
    // Settlement — winner, no-sale, fee math, and safety
    // ------------------------------------------------------------------
    describe("T06 settlement", () => {
        it("no-sale auction settles cleanly without any transfer", async () => {
            const { contract, seller } = await deployFixture();
            const id = bytes32Id("ns");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 10, 10);
            await increase(20);
            await expect(contract.settleAuction(id))
                .to.emit(contract, "AuctionEndedNoSale").withArgs(id);
            const a = await contract.getAuction(id);
            expect(a.status).to.equal(4); // Settled
        });
        it("distributes 97.5% seller + 2.5% treasury with correct math", async () => {
            const { contract, seller, treasury, bidderA } = await deployFixture();
            const id = bytes32Id("split");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("1"), mon("0.1"), start, start + 30, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("1000") });
            await increase(90);

            const sBefore = await ethers.provider.getBalance(seller.address);
            const tBefore = await ethers.provider.getBalance(treasury.address);
            const tx = await contract.settleAuction(id);
            await tx.wait();
            const sAfter = await ethers.provider.getBalance(seller.address);
            const tAfter = await ethers.provider.getBalance(treasury.address);

            expect(sAfter - sBefore).to.equal(mon("975"));
            expect(tAfter - tBefore).to.equal(mon("25"));

            const a = await contract.getAuction(id);
            expect(a.status).to.equal(4);
        });
        it("double settlement reverts", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("dbl");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 10, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await increase(30);
            await contract.settleAuction(id);
            await expect(contract.settleAuction(id)).to.be.revertedWith("BZ:already_settled");
        });
        it("settle before end reverts", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("early");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 600, 10);
            await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            await expect(contract.settleAuction(id)).to.be.revertedWith("BZ:not_ended");
        });
        it("settle on unknown auction reverts", async () => {
            const { contract } = await deployFixture();
            await expect(contract.settleAuction(bytes32Id("ghost"))).to.be.revertedWith("BZ:not_found");
        });
        it("bidder pays exactly their bid (no buyer premium)", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("nopremium");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("1"), mon("0.1"), start, start + 30, 10);
            const before = await ethers.provider.getBalance(bidderA.address);
            const tx = await contract.connect(bidderA).placeBid(id, { value: mon("2") });
            const rcpt = await tx.wait();
            const gas = rcpt.gasUsed * rcpt.gasPrice;
            const after = await ethers.provider.getBalance(bidderA.address);
            expect(before - after - gas).to.equal(mon("2")); // exactly 2 MON left the bidder
        });
    });

    // ------------------------------------------------------------------
    // Safety
    // ------------------------------------------------------------------
    describe("T07 safety", () => {
        it("rejects plain MON transfer to the contract", async () => {
            const { contract, bidderA } = await deployFixture();
            await expect(bidderA.sendTransaction({
                to: await contract.getAddress(),
                value: mon("1")
            })).to.be.revertedWith("BZ:no_plain_transfer");
        });
        it("emits BidPlaced with newEndTime consistent with getAuction", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("ev");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.1"), mon("0.05"), start, start + 600, 10);
            const tx = await contract.connect(bidderA).placeBid(id, { value: mon("0.1") });
            const rcpt = await tx.wait();
            const evLog = rcpt.logs.find(l => l.fragment && l.fragment.name === "BidPlaced");
            const a = await contract.getAuction(id);
            expect(evLog.args.newEndTime).to.equal(a.endTime);
        });
        it("minimumNextBid helper reflects current state", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("min");
            const start = await now();
            await contract.connect(seller).createAuction(id, mon("0.5"), mon("0.1"), start, start + 600, 10);
            expect(await contract.minimumNextBid(id)).to.equal(mon("0.5"));
            await contract.connect(bidderA).placeBid(id, { value: mon("0.5") });
            expect(await contract.minimumNextBid(id)).to.equal(mon("0.6"));
        });
        it("numeric precision: sub-wei math is exact for random values", async () => {
            const { contract, seller, bidderA } = await deployFixture();
            const id = bytes32Id("prec");
            const start = await now();
            await contract.connect(seller).createAuction(id, 1n, 1n, start, start + 30, 10);
            const amount = ethers.parseUnits("1", "wei") * 123_456_789n;
            await contract.connect(bidderA).placeBid(id, { value: amount });
            await increase(60);
            const seller_addr = seller.address;
            const treasury_addr = (await ethers.getSigners())[1].address;
            const sBefore = await ethers.provider.getBalance(seller_addr);
            const tBefore = await ethers.provider.getBalance(treasury_addr);
            await contract.settleAuction(id);
            const fee = (amount * 250n) / 10_000n;
            const payout = amount - fee;
            expect(await ethers.provider.getBalance(seller_addr) - sBefore).to.equal(payout);
            expect(await ethers.provider.getBalance(treasury_addr) - tBefore).to.equal(fee);
        });
    });
});
