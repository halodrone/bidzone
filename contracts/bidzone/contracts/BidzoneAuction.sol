// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title BidzoneAuction — Monad Testnet on-chain auction escrow
 * @notice English ascending auctions with real MON escrow, anti-sniping
 *         reset to exactly the anti-snipe window, pull-based refunds for
 *         outbid bidders, and deterministic settlement into a fixed 2.5%
 *         platform fee + 97.5% seller payout.
 * @dev    - Basis-point arithmetic: FEE_BPS = 250 / 10_000.
 *         - Winner's final bid is NEVER charged a premium: winner pays
 *           exactly their final bid; the fee is deducted from the seller
 *           payout at settlement (seller effectively receives 97.5%).
 *         - Anti-sniping: within the window, endTime is REPLACED with
 *           `block.timestamp + antiSnipeSeconds` — no stacking.
 *         - Refunds are pull-based to avoid griefing / reentrancy on push.
 *         - No proxy / no upgradability. Immutable treasury, immutable fee.
 */
contract BidzoneAuction is ReentrancyGuard {
    using Address for address payable;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Platform fee in basis points (250 = 2.50%). Immutable.
    uint256 public constant FEE_BPS = 250;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum anti-sniping window (safety cap: 1 hour).
    uint32 public constant MAX_ANTI_SNIPE_SECONDS = 3600;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice BIDZONE treasury address — receives FEE_BPS of every
    ///         successful settlement. Set once at construction.
    address payable public immutable treasury;

    enum Status {
        None,       // 0 — uninitialized auction id
        Scheduled,  // 1 — created, not yet started
        Live,       // 2 — accepting bids
        Ended,      // 3 — end time passed, awaiting settlement
        Settled,    // 4 — settled: funds distributed / marked no-sale
        Cancelled   // 5 — cancelled by seller before any bid (reserved)
    }

    struct Auction {
        address seller;
        uint64 startTime;
        uint64 endTime;
        uint32 antiSnipeSeconds;
        Status status;
        // Economics
        uint256 startingBid;      // wei — minimum for first bid
        uint256 minimumIncrement; // wei — minimum delta above currentBid
        uint256 currentBid;       // wei — 0 if no bids yet
        address currentBidder;    // address(0) if no bids yet
        // Bookkeeping
        uint256 totalEscrowed;    // sum currently held for this auction
    }

    /// @notice auctionId => auction data
    mapping(bytes32 => Auction) private _auctions;

    /// @notice pending refunds: (auctionId, bidder) => wei withdrawable
    mapping(bytes32 => mapping(address => uint256)) public refundOf;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AuctionCreated(
        bytes32 indexed auctionId,
        address indexed seller,
        uint256 startingBid,
        uint256 minimumIncrement,
        uint64 startTime,
        uint64 endTime,
        uint32 antiSnipeSeconds
    );

    event BidPlaced(
        bytes32 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint64 newEndTime
    );

    event AuctionExtended(
        bytes32 indexed auctionId,
        uint64 newEndTime
    );

    event RefundAvailable(
        bytes32 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event RefundClaimed(
        bytes32 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionSettled(
        bytes32 indexed auctionId,
        address indexed winner,
        address indexed seller,
        uint256 winningBid,
        uint256 sellerPayout,
        uint256 treasuryFee
    );

    event AuctionEndedNoSale(bytes32 indexed auctionId);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address payable _treasury) {
        require(_treasury != address(0), "BZ:treasury=0");
        treasury = _treasury;
    }

    // ---------------------------------------------------------------------
    // Read helpers
    // ---------------------------------------------------------------------

    function getAuction(bytes32 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function statusOf(bytes32 auctionId) external view returns (Status) {
        return _liveStatus(_auctions[auctionId]);
    }

    /// @notice Compute the minimum acceptable next bid for an auction.
    function minimumNextBid(bytes32 auctionId) external view returns (uint256) {
        Auction storage a = _auctions[auctionId];
        if (a.status == Status.None) return 0;
        if (a.currentBid == 0) return a.startingBid;
        return a.currentBid + a.minimumIncrement;
    }

    // ---------------------------------------------------------------------
    // Auction lifecycle
    // ---------------------------------------------------------------------

    /**
     * @notice Create a new on-chain auction. The auctionId is caller-supplied
     *         (typically the Supabase auction UUID hashed to bytes32) so the
     *         off-chain database can bind cleanly to the on-chain record.
     *
     * @dev Rules:
     *      - id must be non-zero and not already used
     *      - startTime <= endTime, both in the future (or now)
     *      - startingBid > 0, minimumIncrement > 0
     *      - antiSnipeSeconds within [1, MAX_ANTI_SNIPE_SECONDS]
     */
    function createAuction(
        bytes32 auctionId,
        uint256 startingBid,
        uint256 minimumIncrement,
        uint64 startTime,
        uint64 endTime,
        uint32 antiSnipeSeconds
    ) external {
        require(auctionId != bytes32(0), "BZ:id=0");
        require(_auctions[auctionId].status == Status.None, "BZ:id_exists");
        require(startingBid > 0, "BZ:starting_bid=0");
        require(minimumIncrement > 0, "BZ:increment=0");
        require(endTime > startTime, "BZ:end<=start");
        require(endTime > block.timestamp, "BZ:end_in_past");
        require(
            antiSnipeSeconds > 0 && antiSnipeSeconds <= MAX_ANTI_SNIPE_SECONDS,
            "BZ:snipe_out_of_range"
        );

        // Initial status derived from startTime.
        Status initial = startTime <= block.timestamp ? Status.Live : Status.Scheduled;

        _auctions[auctionId] = Auction({
            seller: msg.sender,
            startTime: startTime,
            endTime: endTime,
            antiSnipeSeconds: antiSnipeSeconds,
            status: initial,
            startingBid: startingBid,
            minimumIncrement: minimumIncrement,
            currentBid: 0,
            currentBidder: address(0),
            totalEscrowed: 0
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            startingBid,
            minimumIncrement,
            startTime,
            endTime,
            antiSnipeSeconds
        );
    }

    /**
     * @notice Place a bid. `msg.value` MUST equal the bid amount; the contract
     *         holds the full escrow for the current highest bidder. When
     *         outbid, the previous bidder's escrow is queued to `refundOf`
     *         for pull withdrawal.
     */
    function placeBid(bytes32 auctionId) external payable nonReentrant {
        Auction storage a = _auctions[auctionId];
        require(a.status != Status.None, "BZ:not_found");
        require(msg.sender != a.seller, "BZ:seller_self_bid");
        require(msg.value > 0, "BZ:bid=0");

        // Live-state derivation (also promotes Scheduled -> Live if due).
        Status live = _liveStatus(a);
        require(live == Status.Live, _liveError(live));

        // Minimum increment / starting bid enforcement.
        uint256 minNext = a.currentBid == 0
            ? a.startingBid
            : a.currentBid + a.minimumIncrement;
        require(msg.value >= minNext, "BZ:below_minimum");

        // Queue refund for the outgoing top bidder.
        address prevBidder = a.currentBidder;
        uint256 prevAmount = a.currentBid;
        if (prevBidder != address(0)) {
            refundOf[auctionId][prevBidder] += prevAmount;
            a.totalEscrowed = a.totalEscrowed - prevAmount + msg.value;
            emit RefundAvailable(auctionId, prevBidder, prevAmount);
        } else {
            a.totalEscrowed += msg.value;
        }

        // Promote to Live if this is the first bid on a just-started auction.
        if (a.status != Status.Live) {
            a.status = Status.Live;
        }

        // Update top bid.
        a.currentBid = msg.value;
        a.currentBidder = msg.sender;

        // Anti-sniping: within window, REPLACE end time to
        // block.timestamp + antiSnipeSeconds. No stacking.
        uint64 newEnd = a.endTime;
        if (a.endTime > block.timestamp
            && (a.endTime - uint64(block.timestamp)) <= uint64(a.antiSnipeSeconds)) {
            newEnd = uint64(block.timestamp) + uint64(a.antiSnipeSeconds);
            a.endTime = newEnd;
            emit AuctionExtended(auctionId, newEnd);
        }

        emit BidPlaced(auctionId, msg.sender, msg.value, newEnd);
    }

    /**
     * @notice Settle an auction after `endTime`. Anyone may call this.
     *         - With a winner: transfer 97.5% to seller, 2.5% to treasury.
     *         - No bids: mark as Settled with a no-sale event; nothing moves.
     * @dev Uses checks-effects-interactions + nonReentrant. Sends use Address
     *      library `sendValue`.
     */
    function settleAuction(bytes32 auctionId) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        require(a.status != Status.None, "BZ:not_found");
        require(a.status != Status.Settled, "BZ:already_settled");
        require(a.status != Status.Cancelled, "BZ:cancelled");
        require(block.timestamp >= a.endTime, "BZ:not_ended");

        // Effects first
        a.status = Status.Settled;

        if (a.currentBidder == address(0)) {
            // No bids: nothing to distribute. Contract's escrow for this
            // auction is 0 by construction.
            emit AuctionEndedNoSale(auctionId);
            return;
        }

        uint256 winningBid = a.currentBid;
        address seller = a.seller;
        address winner = a.currentBidder;

        // Zero out escrow bookkeeping for this auction before external calls.
        a.totalEscrowed = 0;

        uint256 treasuryFee = (winningBid * FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerPayout = winningBid - treasuryFee;

        // Interactions
        payable(seller).sendValue(sellerPayout);
        treasury.sendValue(treasuryFee);

        emit AuctionSettled(
            auctionId,
            winner,
            seller,
            winningBid,
            sellerPayout,
            treasuryFee
        );
    }

    /**
     * @notice Withdraw refund owed to `msg.sender` for a given auction.
     *         Pull-based to avoid reentrancy attacks on push transfers.
     */
    function withdrawRefund(bytes32 auctionId) external nonReentrant {
        uint256 amount = refundOf[auctionId][msg.sender];
        require(amount > 0, "BZ:no_refund");

        refundOf[auctionId][msg.sender] = 0;

        // Also account for auction-level escrow bookkeeping when a refund
        // is claimed — the contract's internal `totalEscrowed` mirrors the
        // sum of (currentBid + all outstanding refunds) for the auction.
        Auction storage a = _auctions[auctionId];
        if (a.totalEscrowed >= amount) {
            a.totalEscrowed -= amount;
        }

        payable(msg.sender).sendValue(amount);
        emit RefundClaimed(auctionId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _liveStatus(Auction storage a) internal view returns (Status) {
        if (a.status == Status.None) return Status.None;
        if (a.status == Status.Settled) return Status.Settled;
        if (a.status == Status.Cancelled) return Status.Cancelled;
        if (block.timestamp < a.startTime) return Status.Scheduled;
        if (block.timestamp >= a.endTime) return Status.Ended;
        return Status.Live;
    }

    function _liveError(Status s) internal pure returns (string memory) {
        if (s == Status.Scheduled) return "BZ:not_started";
        if (s == Status.Ended)     return "BZ:ended";
        if (s == Status.Settled)   return "BZ:already_settled";
        if (s == Status.Cancelled) return "BZ:cancelled";
        return "BZ:not_live";
    }

    // ---------------------------------------------------------------------
    // Safety
    // ---------------------------------------------------------------------

    /// @notice The contract intentionally does NOT accept plain ETH transfers
    ///         outside `placeBid`. This prevents accidental fund lock-in.
    receive() external payable {
        revert("BZ:no_plain_transfer");
    }

    fallback() external payable {
        revert("BZ:no_fallback");
    }
}
