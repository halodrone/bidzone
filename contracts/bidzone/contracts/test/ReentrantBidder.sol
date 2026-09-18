// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBidzone {
    function placeBid(bytes32) external payable;
    function withdrawRefund(bytes32) external;
}

/**
 * Malicious contract used exclusively in Hardhat tests. Attempts to re-enter
 * `withdrawRefund` from its receive() callback. Should be blocked by the
 * contract's `nonReentrant` modifier + pull-based accounting.
 */
contract ReentrantBidder {
    IBidzone public target;
    bytes32 public auctionId;
    bool public attacking;

    constructor(address _target) {
        target = IBidzone(_target);
    }

    function attack(bytes32 _id) external payable {
        auctionId = _id;
        target.placeBid{value: msg.value}(_id);
    }

    function withdraw(bytes32 _id) external {
        attacking = true;
        target.withdrawRefund(_id);
        attacking = false;
    }

    receive() external payable {
        if (attacking) {
            try target.withdrawRefund(auctionId) {
                // If this ever succeeds, the guard failed.
            } catch {
                // Expected: nonReentrant reverts the inner call.
            }
        }
    }
}
