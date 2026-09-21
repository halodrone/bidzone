// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title BidzoneNFTEscrow — on-chain NFT auction escrow (Phase 7.2)
 * @notice English ascending auctions for ERC-721 items with REAL contract
 *         level NFT escrow + real MON bid escrow:
 *           1. seller approves this contract for the token and registers the
 *              auction -> the NFT is pulled INTO this contract (escrow),
 *           2. bidders place MON bids (pull-based refunds for outbid bidders),
 *           3. after endTime, settle() atomically:
 *                - transfers the NFT to the winner,
 *                - pays 97.5% to the seller, 2.5% to the treasury,
 *           4. with no bids, the seller can cancel() to reclaim the NFT.
 *
 * Guarantees:
 *  - ONE active listing per (nft, tokenId) -> no double listing.
 *  - The escrowed NFT cannot leave except via settle() (to the winner) or
 *    cancel() (back to seller, only when there are NO bids) — the seller
 *    cannot reclaim an escrowed NFT once it has bids.
 *  - Self-bid prevented; bids below minimum-next rejected; bids after end
 *    rejected; settle is idempotent (second call reverts BZ:already_settled);
 *    settle without escrow impossible (the contract IS the escrow holder).
 *  - Fee math identical to BidzoneAuction: winner pays exactly their bid,
 *    FEE_BPS=250 (2.5%) to treasury, seller receives 97.5%. Losing bidders
 *    pay nothing (pull refunds).
 *  - No proxy/upgradability. Immutable treasury, immutable fee.
 */
contract BidzoneNFTEscrow is ReentrancyGuard {
    using Address for address payable;

    uint256 public constant FEE_BPS = 250;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint32 public constant MAX_ANTI_SNIPE_SECONDS = 3600;

    enum Status {None, Live, Ended, Settled, Cancelled}

    struct Listing {
        address seller;
        uint256 startingBid;
        uint256 minimumIncrement;
        uint64 endTime;
        uint32 antiSnipeSeconds;
        uint256 currentBid;
        address currentBidder;
        Status status;
    }

    /// @notice (nft, tokenId) => listing. Keyed by the asset itself so a
    ///         token can only be in ONE active BIDZONE auction at a time.
    mapping(address => mapping(uint256 => Listing)) private _listings;

    /// @notice pending MON refunds: (nft, tokenId, bidder) => wei
    mapping(address => mapping(uint256 => mapping(address => uint256))) public refundOf;

    address payable public immutable treasury;

    event Escrowed(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 startingBid,
        uint256 minimumIncrement,
        uint64 endTime,
        uint32 antiSnipeSeconds
    );
    event BidPlaced(address indexed nft, uint256 indexed tokenId, address indexed bidder, uint256 amount, uint64 newEndTime);
    event AuctionExtended(address indexed nft, uint256 indexed tokenId, uint64 newEndTime);
    event RefundAvailable(address indexed nft, uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event Settled(address indexed nft, uint256 indexed tokenId, address indexed winner, address seller, uint256 winningBid, uint256 sellerPayout, uint256 treasuryFee);
    event Cancelled(address indexed nft, uint256 indexed tokenId, address indexed seller);

    error BZNotTreasury();
    error BZZeroAddress();
    error BZNotRegistered();
    error BZNotActive();
    error BZNotEnded();
    error BZAlreadySettled();
    error BZCancelled();
    error BZEndPast();
    error BZEndLEStart();
    error BZStartingBidZero();
    error BZIncrementZero();
    error BZSnipeRange();
    error BZNotSeller();
    error BZSelfBid();
    error BZBelowMinimum();
    error BZNoRefund();
    error BZHasBids();
    error BZNFTZero();

    constructor(address payable _treasury) {
        if (_treasury == address(0)) revert BZNotTreasury();
        treasury = _treasury;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    function listing(address nft, uint256 tokenId) external view returns (Listing memory) {
        return _listings[nft][tokenId];
    }

    function minimumNextBid(address nft, uint256 tokenId) external view returns (uint256) {
        Listing storage l = _listings[nft][tokenId];
        if (l.status == Status.None) return 0;
        if (l.currentBid == 0) return l.startingBid;
        return l.currentBid + l.minimumIncrement;
    }

    /// @notice Live-on-chain status — also accounts for a passed endTime.
    function statusOf(address nft, uint256 tokenId) external view returns (Status) {
        Listing storage l = _listings[nft][tokenId];
        if (l.status == Status.Live && l.endTime <= block.timestamp) {
            return Status.Ended;
        }
        return l.status;
    }

    // ------------------------------------------------------------------
    // Seller: register (escrow) + cancel (no bids)
    // ------------------------------------------------------------------

    /**
     * @notice Register + escrow the NFT for auction in one step. Caller must
     *         own the token and have approved this contract (or be approved
     *         for all). The NFT is transferred to THIS contract.
     */
    function registerAuction(
        address nft,
        uint256 tokenId,
        uint256 startingBid,
        uint256 minimumIncrement,
        uint64 endTime,
        uint32 antiSnipeSeconds
    ) external nonReentrant returns (bool) {
        if (nft == address(0)) revert BZNFTZero();
        if (startingBid == 0) revert BZStartingBidZero();
        if (minimumIncrement == 0) revert BZIncrementZero();
        if (endTime <= block.timestamp) revert BZEndPast();
        if (antiSnipeSeconds == 0 || antiSnipeSeconds > MAX_ANTI_SNIPE_SECONDS) revert BZSnipeRange();

        Listing storage l = _listings[nft][tokenId];
        if (l.status != Status.None && l.status != Status.Cancelled && l.status != Status.Settled) {
            revert BZNotActive(); // one active listing per asset — no double listing
        }

        IERC721 collection = IERC721(nft);
        // Ownership + approval verified by the transfer itself (reverts on
        // missing approval / wrong owner) — but check owner explicitly for a
        // clearer error first.
        if (collection.ownerOf(tokenId) != msg.sender) revert BZNotSeller();

        _listings[nft][tokenId] = Listing({
            seller: msg.sender,
            startingBid: startingBid,
            minimumIncrement: minimumIncrement,
            endTime: endTime,
            antiSnipeSeconds: antiSnipeSeconds,
            currentBid: 0,
            currentBidder: address(0),
            status: Status.Live
        });

        collection.transferFrom(msg.sender, address(this), tokenId);

        emit Escrowed(nft, tokenId, msg.sender, startingBid, minimumIncrement, endTime, antiSnipeSeconds);
        return true;
    }

    /**
     * @notice Cancel and reclaim the NFT — seller only, and ONLY while no
     *         bid exists. Once the NFT has bids the seller cannot pull it
     *         out (settle to the winner is the only release path).
     */
    function cancelAuction(address nft, uint256 tokenId) external nonReentrant returns (bool) {
        Listing storage l = _listings[nft][tokenId];
        if (l.status == Status.None) revert BZNotRegistered();
        if (l.status == Status.Cancelled) revert BZCancelled();
        // NOTE: a Settled listing is reclaimable only in the no-sale case —
        // with bids, currentBidder != 0 and the BZHasBids guard below blocks
        // cancellation (settle-to-winner is the only release path).
        if (l.seller != msg.sender) revert BZNotSeller();
        if (l.currentBidder != address(0)) revert BZHasBids();

        l.status = Status.Cancelled;
        IERC721(nft).transferFrom(address(this), msg.sender, tokenId);
        emit Cancelled(nft, tokenId, msg.sender);
        return true;
    }

    // ------------------------------------------------------------------
    // Bidding (MON escrow, pull refunds, anti-sniping)
    // ------------------------------------------------------------------
    function placeBid(address nft, uint256 tokenId) external payable nonReentrant returns (bool) {
        Listing storage l = _listings[nft][tokenId];
        if (l.status == Status.None) revert BZNotRegistered();
        if (l.status != Status.Live) revert BZNotActive();
        if (l.endTime <= block.timestamp) revert BZNotEnded();
        if (msg.sender == l.seller) revert BZSelfBid();

        uint256 minNext = l.currentBid == 0 ? l.startingBid : l.currentBid + l.minimumIncrement;
        if (msg.value < minNext) revert BZBelowMinimum();

        address prevBidder = l.currentBidder;
        uint256 prevAmount = l.currentBid;
        if (prevBidder != address(0)) {
            refundOf[nft][tokenId][prevBidder] += prevAmount;
            emit RefundAvailable(nft, tokenId, prevBidder, prevAmount);
        }

        l.currentBid = msg.value;
        l.currentBidder = msg.sender;

        uint64 newEnd = l.endTime;
        if (l.endTime > block.timestamp
            && (l.endTime - uint64(block.timestamp)) <= uint64(l.antiSnipeSeconds)) {
            newEnd = uint64(block.timestamp) + uint64(l.antiSnipeSeconds);
            l.endTime = newEnd;
            emit AuctionExtended(nft, tokenId, newEnd);
        }

        emit BidPlaced(nft, tokenId, msg.sender, msg.value, newEnd);
        return true;
    }

    function claimRefund(address nft, uint256 tokenId) external nonReentrant returns (bool) {
        uint256 amount = refundOf[nft][tokenId][msg.sender];
        if (amount == 0) revert BZNoRefund();
        refundOf[nft][tokenId][msg.sender] = 0;
        payable(msg.sender).sendValue(amount);
        return true;
    }

    // ------------------------------------------------------------------
    // Settlement — permissionless after endTime; idempotent via status.
    // Atomically: NFT -> winner, 97.5% -> seller, 2.5% -> treasury.
    // ------------------------------------------------------------------
    function settle(address nft, uint256 tokenId) external nonReentrant returns (bool) {
        Listing storage l = _listings[nft][tokenId];
        if (l.status == Status.None) revert BZNotRegistered();
        if (l.status == Status.Settled) revert BZAlreadySettled();
        if (l.status == Status.Cancelled) revert BZCancelled();
        if (block.timestamp < l.endTime) revert BZNotEnded();

        l.status = Status.Settled;

        if (l.currentBidder == address(0)) {
            // No sale: the NFT stays escrowed; seller reclaims via cancelAuction.
            emit Settled(nft, tokenId, address(0), l.seller, 0, 0, 0);
            return true;
        }

        address winner = l.currentBidder;
        address seller = l.seller;
        uint256 winningBid = l.currentBid;

        uint256 treasuryFee = (winningBid * FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerPayout = winningBid - treasuryFee;

        // Interactions (checks-effects-interactions; status already Settled).
        IERC721(nft).transferFrom(address(this), winner, tokenId);
        payable(seller).sendValue(sellerPayout);
        treasury.sendValue(treasuryFee);

        emit Settled(nft, tokenId, winner, seller, winningBid, sellerPayout, treasuryFee);
        return true;
    }
}
