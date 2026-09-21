// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockERC721 — TEST-ONLY generic ERC-721 collection.
 * @notice Used by Model B tests to prove BidzoneNFTEscrow works with ANY
 *         standard ERC-721 (not just BidzoneNFT). Never deployed to testnet.
 */
contract MockERC721 is ERC721 {
    uint256 public nextTokenId = 1;

    constructor() ERC721("Mock Collection", "MOCK") {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _mint(to, tokenId);
    }

    function mintWithUri(address to, string calldata) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _mint(to, tokenId);
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
