import { createPublicClient, createWalletClient, custom, http, parseEther } from "viem";
import { monadChain, MONAD } from "@/lib/monad";
import NFT_ABI from "@/lib/contracts/BidzoneNFT.abi.json";
import NFT_ESCROW_ABI from "@/lib/contracts/BidzoneNFTEscrow.abi.json";

/**
 * BIDZONE Phase 7.2 — thin viem wrappers for the NFT auction path.
 * Mirrors lib/bidzoneAuction.js: public reads via RPC; writes signed by the
 * user's embedded (Privy) wallet — user pays gas, no keys handled anywhere.
 */

export const NFT_CONTRACT_ADDRESS =
    (typeof process !== "undefined" && process.env.REACT_APP_NFT_CONTRACT_ADDRESS) || "";
export const NFT_ESCROW_ADDRESS =
    (typeof process !== "undefined" && process.env.REACT_APP_NFT_ESCROW_ADDRESS) || "";

export const isNftAvailable = () => Boolean(NFT_CONTRACT_ADDRESS && NFT_ESCROW_ADDRESS);

if (typeof window !== "undefined") {
    window.__BIDZONE_DEBUG_NFT__ = {
        NFT_CONTRACT_ADDRESS,
        NFT_ESCROW_ADDRESS,
        isNftAvailable: isNftAvailable(),
    };
}


/** Stable tokenURI origin (production origin — env-driven, never hardcoded). */
export const METADATA_BASE_URL =
    (typeof process !== "undefined" && process.env.REACT_APP_METADATA_BASE_URL) || "";

const readClient = createPublicClient({
    chain: monadChain,
    transport: http(MONAD.rpcUrl),
});

async function walletClientFrom(wallet) {
    if (!wallet) throw new Error("Embedded wallet is not ready");
    await wallet.switchChain(MONAD.chainId);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
        account: wallet.address,
        chain: monadChain,
        transport: custom(provider),
    });
}

async function waitReceipt(hash) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await readClient.waitForTransactionReceipt({
                hash,
                timeout: 60_000,
                pollingInterval: 1_000,
            });
        } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
    throw lastErr;
}

/* ----------------------------- READS ----------------------------- */

/** On-chain owner of a token — THE source of truth for ownership UI. */
export async function readNftOwner(tokenId) {
    if (!isNftAvailable()) return null;
    return readClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
    });
}

/** On-chain listing record for a token (escrow state). */
export async function readNftListing(tokenId) {
    if (!isNftAvailable()) return null;
    return readClient.readContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "listing",
        args: [NFT_CONTRACT_ADDRESS, BigInt(tokenId)],
    });
}

/** Status enum -> label. */
export function escrowStatusLabel(status) {
    // 0 None · 1 Live · 2 Ended · 3 Settled · 4 Cancelled
    return ["None", "Live", "Ended", "Settled", "Cancelled"][Number(status)] ?? "None";
}

/* ----------------------------- WRITES ---------------------------- */

/** Mint a new NFT to the seller's embedded wallet (user pays gas). */
export async function mintNft({ wallet, tokenUri }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "mint",
        args: [tokenUri],
    });
    const receipt = await waitReceipt(hash);
    // tokenId from the Minted event (or infer from nextTokenId via receipt log order)
    let tokenId = null;
    for (const log of receipt.logs) {
        try {
            const decoded = readClient.decodeEventLog({
                abi: NFT_ABI,
                data: log.data,
                topics: log.topics,
            });
            if (decoded.eventName === "Minted") {
                tokenId = decoded.args.tokenId.toString();
                break;
            }
        } catch {
            /* not our event */
        }
    }
    if (tokenId == null) throw new Error("Mint succeeded but tokenId was not found in the receipt");
    return { hash, tokenId: String(tokenId) };
}

/** Approve the escrow contract for one token (user pays gas). */
export async function approveNftForEscrow({ wallet, tokenId }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "approve",
        args: [NFT_ESCROW_ADDRESS, BigInt(tokenId)],
    });
    await waitReceipt(hash);
    return { hash };
}

/**
 * Register the auction on-chain: the escrow contract pulls the approved NFT
 * into contract escrow (one active listing per token).
 */
export async function registerNftAuctionOnchain({ wallet, tokenId, startingBidMon, minimumIncrementMon, endTime }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "registerAuction",
        args: [
            NFT_CONTRACT_ADDRESS,
            BigInt(tokenId),
            parseEther(String(startingBidMon)),
            parseEther(String(minimumIncrementMon)),
            BigInt(Math.floor(new Date(endTime).getTime() / 1000)),
            10, // anti-sniping seconds — same as BIDZONE standard
        ],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Settle an ended NFT auction (permissionless): NFT->winner + 97.5/2.5 split. */
export async function settleNftAuctionOnchain({ wallet, tokenId }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "settle",
        args: [NFT_CONTRACT_ADDRESS, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Send (transfer) an owned NFT to a destination address — user pays gas. */
export async function sendNftOnchain({ wallet, tokenId, toAddress }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "safeTransferFrom",
        args: [wallet.address, toAddress, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** On-chain bid on an NFT auction (MON escrow in BidzoneNFTEscrow). */
export async function placeBidNftOnchain({ wallet, tokenId, bidMon }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "placeBid",
        args: [NFT_CONTRACT_ADDRESS, BigInt(tokenId)],
        value: parseEther(String(bidMon)),
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** DB-independent minimum next bid for NFT auctions (from listing state). */
export async function minimumNextBidNft(tokenId) {
    const l = await readNftListing(tokenId);
    if (!l) return null;
    if (Number(l.status) === 0) return null;
    return l.currentBid === 0n ? l.startingBid : l.currentBid + l.minimumIncrement;
}
