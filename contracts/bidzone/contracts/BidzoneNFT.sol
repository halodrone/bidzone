// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BidzoneNFT — BIDZONE ERC-721 collection (Phase 7.2)
 * @notice Standard ERC-721 with URIStorage used by BIDZONE NFT auctions.
 *
 * Minting authorization model ("no unrestricted public minting"):
 *  - Minting is MINT-TO-SELF ONLY: msg.sender receives the token; nobody can
 *    mint into someone else's wallet.
 *  - Global supply cap (`maxSupply`, immutable) + per-wallet mint cap
 *    (MAX_PER_WALLET) bound spam.
 *  - The token is only useful on BIDZONE after it is escrowed by the
 *    auction escrow contract, which enforces ownership + approval.
 *  - No minter role that can mint to arbitrary recipients; no airdrop path.
 *
 * tokenURI: stored off-chain via the app's stable metadata gateway
 * (e.g. https://<stable-origin>/api/nft-metadata/{auctionId}); the URI string
 * itself is immutable per token (no URI rotation).
 */
contract BidzoneNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 public nextTokenId;
    uint256 public immutable maxSupply;
    uint256 public constant MAX_PER_WALLET = 100;

    mapping(address => uint256) public mintCountOf;

    error MintCapReached();
    error WalletMintCapReached();
    error EmptyTokenURI();

    event Minted(address indexed minter, uint256 indexed tokenId, string tokenURI);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address initialOwner_
    ) ERC721(name_, symbol_) Ownable(initialOwner_) {
        require(maxSupply_ > 0, "BZNFT:supply=0");
        maxSupply = maxSupply_;
    }

    /**
     * @notice Mint a new token to the CALLER (mint-to-self only).
     * @return tokenId the newly minted token id (sequential, unique).
     */
    function mint(string calldata tokenURI_) external returns (uint256 tokenId) {
        if (bytes(tokenURI_).length == 0) revert EmptyTokenURI();
        if (nextTokenId >= maxSupply) revert MintCapReached();
        if (mintCountOf[msg.sender] >= MAX_PER_WALLET) revert WalletMintCapReached();

        tokenId = nextTokenId + 1;
        nextTokenId = tokenId;

        _mint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        mintCountOf[msg.sender] += 1;

        emit Minted(msg.sender, tokenId, tokenURI_);
    }

    // --- overrides (OZ v5 requirement) ---
    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
