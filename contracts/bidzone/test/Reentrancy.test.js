const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const bytes32Id = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const mon = (v) => ethers.parseEther(String(v));

async function now() { return (await ethers.provider.getBlock("latest")).timestamp; }
async function increase(sec) {
    await network.provider.send("evm_increaseTime", [sec]);
    await network.provider.send("evm_mine");
}

/**
 * BIDZONE Phase 6.5 — reentrancy attack test.
 * A malicious bidder attempts to re-enter withdrawRefund from its receive()
 * callback. The nonReentrant guard combined with pull-based accounting
 * (refundOf zeroed before the external send) MUST block the re-entry.
 */
describe("BidzoneAuction — reentrancy protection", () => {
    it("withdrawRefund is not re-enterable", async () => {
        const [deployer, treasury, seller, honestBidder] = await ethers.getSigners();
        const F = await ethers.getContractFactory("BidzoneAuction", deployer);
        const contract = await F.deploy(treasury.address);
        await contract.waitForDeployment();
        const cAddr = await contract.getAddress();

        const A = await ethers.getContractFactory("ReentrantBidder", deployer);
        const attacker = await A.deploy(cAddr);
        await attacker.waitForDeployment();

        // Fund the attacker enough to cover initial bid.
        await deployer.sendTransaction({ to: await attacker.getAddress(), value: mon("5") });

        const id = bytes32Id("reentry");
        const start = await now();
        await contract.connect(seller).createAuction(
            id, mon("0.1"), mon("0.05"), start, start + 600, 10
        );

        // Attacker becomes top bidder.
        await attacker.attack(id, { value: mon("0.1") });
        // Honest bidder outbids -> attacker's escrow queued for refund.
        await contract.connect(honestBidder).placeBid(id, { value: mon("0.15") });

        const refundBefore = await contract.refundOf(id, await attacker.getAddress());
        expect(refundBefore).to.equal(mon("0.1"));

        // Attacker tries to withdraw + re-enter.
        await attacker.withdraw(id);

        // Only the queued amount (0.1) should have been received. If reentry
        // had worked, more would have been drained.
        const cBal = await ethers.provider.getBalance(cAddr);
        // Contract still holds the honest bidder's escrow (0.15).
        expect(cBal).to.equal(mon("0.15"));
        // Ledger is zero.
        expect(await contract.refundOf(id, await attacker.getAddress())).to.equal(0);
    });
});
