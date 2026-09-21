import { createPublicClient, createWalletClient, custom, http, parseEther, getContract } from "viem";
import { monadChain, MONAD } from "@/lib/monad";
import NFT_ABI from "@/lib/contracts/BidzoneNFT.abi.json";
import NFT_ESCROW_ABI from "@/lib/contracts/BidzoneNFTEscrow.abi.json";
import ERC721_ABI from "@/lib/contracts/BidzoneERC721.abi.json";

/**
 * BIDZONE Phase 7.2 FINAL — Model B: NFT ASSET system.
 * NFTs already owned by a wallet (embedded or external) are collected,
 * auctioned, escrowed, won and transferred. There is NO mint-on-auction.
 * Every helper is parameterised by (nftContract, tokenId) — the escrow
 * supports ANY standard ERC-721. Blockchain state is the source of truth.
 */

// CRA/webpack inlines process.env.REACT_APP_* at build time — use the plain
// project convention (no typeof-process guards, no debug shims).
export const NFT_CONTRACT_ADDRESS = process.env.REACT_APP_NFT_CONTRACT_ADDRESS || "";
export const NFT_ESCROW_ADDRESS = process.env.REACT_APP_NFT_ESCROW_ADDRESS || "";
export const METADATA_BASE_URL = process.env.REACT_APP_METADATA_BASE_URL || "";

export const isNftAvailable = () => Boolean(NFT_CONTRACT_ADDRESS && NFT_ESCROW_ADDRESS);

const readClient = createPublicClient({
    chain: monadChain,
    transport: http(MONAD.rpcUrl),
});

const norm = (a) => (a ? String(a).toLowerCase() : "");
const sameAddr = (a, b) => Boolean(norm(a)) && norm(a) === norm(b);

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

/* ================================ READS ================================ */

/** On-chain owner of a token — THE source of truth for ownership UI. */
export async function readNftOwner(nftContract, tokenId) {
    return readClient.readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
    });
}

/** tokenURI of a token (raw — use normalizeMediaUrl before fetching). */
export async function readTokenURI(nftContract, tokenId) {
    return readClient.readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
    });
}

/** Collection name() — falls back to symbol, then null. */
export async function readCollectionName(nftContract) {
    try {
        return (await readClient.readContract({ address: nftContract, abi: ERC721_ABI, functionName: "name" })) || null;
    } catch {
        try {
            return (await readClient.readContract({ address: nftContract, abi: ERC721_ABI, functionName: "symbol" })) || null;
        } catch {
            return null;
        }
    }
}

/** On-chain escrow listing for a token (BidzoneNFTEscrow). */
export async function readNftListing(nftContract, tokenId) {
    return readClient.readContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "listing",
        args: [nftContract, BigInt(tokenId)],
    });
}

/** Live-on-chain escrow status (promotes Live -> Ended once past endTime). */
export async function readEscrowStatus(nftContract, tokenId) {
    const s = await readClient.readContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "statusOf",
        args: [nftContract, BigInt(tokenId)],
    });
    return Number(s);
}

/** DB-independent minimum next bid for an NFT auction (from listing state). */
export async function minimumNextBidNft(nftContract, tokenId) {
    const l = await readNftListing(nftContract, tokenId);
    if (!l) return null;
    if (Number(l.status) === 0) return null;
    return l.currentBid === 0n ? l.startingBid : l.currentBid + l.minimumIncrement;
}

/** Token-specific approval address for a token (zero address = none). */
export async function readApproved(nftContract, tokenId) {
    try {
        return await readClient.readContract({ address: nftContract, abi: ERC721_ABI, functionName: "getApproved", args: [BigInt(tokenId)] });
    } catch {
        return null;
    }
}

/** Is the escrow contract allowed to transfer this token? */
export async function isApprovedForEscrow(nftContract, tokenId, owner) {
    try {
        const approved = await readApproved(nftContract, tokenId);
        if (approved && sameAddr(approved, NFT_ESCROW_ADDRESS)) return true;
        return await readClient.readContract({
            address: nftContract,
            abi: ERC721_ABI,
            functionName: "isApprovedForAll",
            args: [owner, NFT_ESCROW_ADDRESS],
        });
    } catch {
        return false;
    }
}

/** Is the token currently held by the escrow contract? */
export async function isTokenEscrowed(nftContract, tokenId) {
    try {
        const owner = await readNftOwner(nftContract, tokenId);
        return sameAddr(owner, NFT_ESCROW_ADDRESS);
    } catch {
        return false;
    }
}

/** Status enum -> label. 0 None · 1 Live · 2 Ended · 3 Settled · 4 Cancelled */
export function escrowStatusLabel(status) {
    return ["None", "Live", "Ended", "Settled", "Cancelled"][Number(status)] ?? "None";
}

/** True when the token exists (ownerOf succeeds). */
export async function tokenExists(nftContract, tokenId) {
    try {
        await readNftOwner(nftContract, tokenId);
        return true;
    } catch {
        return false;
    }
}

/* ============================== METADATA ============================== */

const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://w3s.link/ipfs/"];

/** Normalize ipfs:// (and bare ipfs paths) to an https gateway URL. */
export function normalizeMediaUrl(uri) {
    if (!uri) return null;
    const u = String(uri).trim();
    if (u.startsWith("ipfs://")) return `${IPFS_GATEWAYS[0]}${u.slice(7).replace(/^ipfs\//, "")}`;
    if (/^ipfs\//i.test(u)) return `https://ipfs.io/${u}`;
    if (u.startsWith("https://") || u.startsWith("http://")) return u;
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^ba[A-Za-z0-9]{50,}$/.test(u)) return `${IPFS_GATEWAYS[0]}${u}`;
    if (u.startsWith("data:")) return u;
    return null;
}

/** Every gateway variant of an ipfs URL (first success wins). */
function gatewayCandidates(url) {
    const idx = IPFS_GATEWAYS.findIndex((g) => url.startsWith(g));
    if (idx === -1) return [url];
    const rest = url.slice(IPFS_GATEWAYS[idx].length);
    return IPFS_GATEWAYS.map((g) => g + rest);
}

/**
 * Full metadata for an owned NFT — read from the token itself (tokenURI),
 * never from user input. Handles https://, ipfs:// and data: URIs; falls
 * back to the BIDZONE metadata proxy when the browser fetch fails (CORS).
 */
export async function fetchNftMetadata(nftContract, tokenId) {
    let uri = null;
    try {
        uri = await readTokenURI(nftContract, tokenId);
    } catch {
        /* some collections revert on tokenURI — metadata optional */
    }
    const httpUri = normalizeMediaUrl(uri);
    let json = null;
    if (httpUri) {
        for (const candidate of gatewayCandidates(httpUri)) {
            try {
                const res = await fetch(candidate, { headers: { Accept: "application/json" } });
                if (!res.ok) throw new Error(String(res.status));
                const text = await res.text();
                json = JSON.parse(text);
                break;
            } catch {
                /* try the next gateway / proxy */
            }
        }
        if (!json) {
            try {
                const proxy = `${process.env.REACT_APP_BACKEND_URL || ""}/api/nft-metadata-proxy?url=${encodeURIComponent(httpUri)}`;
                const res2 = await fetch(proxy);
                if (res2.ok) json = await res2.json();
            } catch {
                json = null; // metadata optional — UI degrades honestly
            }
        }
    }
    // data:application/json;base64 URIs
    if (!json && httpUri && httpUri.startsWith("data:")) {
        try {
            const b64 = httpUri.split("base64,")[1] || "";
            json = JSON.parse(atob(b64));
        } catch {
            json = null;
        }
    }
    const rawAttrs = json && (json.attributes || json.traits || json.properties) || [];
    const attributes = (Array.isArray(rawAttrs) ? rawAttrs : Object.entries(rawAttrs).map(([trait_type, value]) => ({ trait_type, value })))
        .map((a) => {
            if (a && typeof a === "object") {
                const t = a.trait_type ?? a.trait ?? a.type ?? (a.key ?? null);
                const v = a.value ?? a.val ?? null;
                return t != null && v != null ? { trait_type: String(t), value: String(v) } : null;
            }
            return null;
        })
        .filter(Boolean);
    const rarityAttr = attributes.find((a) => /rarity/i.test(a.trait_type));
    return {
        name: (json && (json.name || json.title)) || null,
        description: (json && (json.description || json.desc)) || null,
        image: normalizeMediaUrl((json && (json.image || json.image_url || (json.properties && json.properties.image))) || null),
        attributes,
        rarity: (rarityAttr && rarityAttr.value) || (json && json.rarity) || null,
        collectionName: (json && json.collection && (json.collection.name || json.collection)) || null,
        tokenUriRaw: uri || null,
    };
}

/**
 * On-chain discovery: Transfer logs TO a wallet on known collections.
 * Used to find tokens the wallet owns that are missing from the index.
 */
export async function discoverOwnedTransfers({ ownerWallet, nftContracts = [], maxLookBlocks = 500_000 }) {
    const out = [];
    const contracts = nftContracts.filter(Boolean);
    if (!ownerWallet || contracts.length === 0) return out;
    for (const c of contracts) {
        try {
            const latest = await readClient.getBlockNumber();
            const fromBlock = latest > BigInt(maxLookBlocks) ? latest - BigInt(maxLookBlocks) : 0n;
            const logs = await readClient.getLogs({
                address: c,
                event: ERC721_ABI.find((e) => e.type === "event" && e.name === "Transfer"),
                args: { to: ownerWallet },
                fromBlock,
                toBlock: "latest",
            });
            for (const log of logs) {
                out.push({ nftContract: c, tokenId: log.args.tokenId.toString() });
            }
        } catch {
            /* RPC range limits — index discovery still covers these */
        }
    }
    return out;
}

/* ================================ WRITES ============================== */

/**
 * Mint a demo/testnet NFT to the CALLER's wallet on BidzoneNFT (mint-to-self).
 * NOT part of the auction flow — Model B auctions start from an owned NFT.
 */
export async function mintNft({ wallet, tokenUri }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "mint",
        args: [tokenUri],
    });
    const receipt = await waitReceipt(hash);
    let tokenId = null;
    for (const log of receipt.logs) {
        try {
            const decoded = readClient.decodeEventLog({ abi: NFT_ABI, data: log.data, topics: log.topics });
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

/** Token-specific approval for the escrow (prefer over setApprovalForAll). */
export async function approveNftForEscrow({ wallet, nftContract, tokenId }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "approve",
        args: [NFT_ESCROW_ADDRESS, BigInt(tokenId)],
    });
    await waitReceipt(hash);
    return { hash };
}

/**
 * Register the auction on-chain: the escrow pulls the approved NFT into
 * contract escrow (one active listing per (nft, tokenId)). ANY ERC-721.
 */
export async function registerNftAuctionOnchain({ wallet, nftContract, tokenId, startingBidMon, minimumIncrementMon, endTime, antiSnipeSeconds = 10 }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "registerAuction",
        args: [
            nftContract,
            BigInt(tokenId),
            parseEther(String(startingBidMon)),
            parseEther(String(minimumIncrementMon)),
            BigInt(Math.floor(new Date(endTime).getTime() / 1000)),
            antiSnipeSeconds,
        ],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Settle an ended NFT auction (permissionless): NFT->winner + 97.5/2.5. */
export async function settleNftAuctionOnchain({ wallet, nftContract, tokenId }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "settle",
        args: [nftContract, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Cancel a no-bid listing and reclaim the NFT (seller only). */
export async function cancelNftAuctionOnchain({ wallet, nftContract, tokenId }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "cancelAuction",
        args: [nftContract, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Send (transfer) an owned NFT from the EMBEDDED wallet — user pays gas. */
export async function sendNftOnchain({ wallet, nftContract, tokenId, toAddress }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "safeTransferFrom",
        args: [wallet.address, toAddress, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/**
 * External-wallet leg of RECEIVE NFT: sign the transfer FROM an external
 * wallet (MetaMask/injected EIP-1193) TO the embedded wallet. Used ONLY for
 * this intentional receive operation — never part of BIDZONE login.
 */
export async function transferFromExternalWallet({ nftContract, tokenId, fromAddress, toAddress }) {
    if (typeof window === "undefined" || !window.ethereum) {
        const err = new Error("NO_INJECTED_WALLET");
        throw err;
    }
    const client = createWalletClient({
        account: fromAddress,
        chain: monadChain,
        transport: custom(window.ethereum),
    });
    try {
        await client.switchChain({ id: MONAD.chainId });
    } catch (e) {
        throw new Error("External wallet must switch to the Monad network to send this NFT");
    }
    const accounts = await client.requestAddresses().catch(() => null);
    if (!accounts || !sameAddr(accounts[0], fromAddress)) {
        throw new Error("Connected external wallet does not own this NFT");
    }
    const hash = await client.writeContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "safeTransferFrom",
        args: [fromAddress, toAddress, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Injected wallet present in this browser (external-wallet receive leg)? */
export function hasInjectedWallet() {
    return typeof window !== "undefined" && Boolean(window.ethereum);
}

/* ====================== ON-CHAIN BID (auction room) ==================== */
export async function placeBidNftOnchain({ wallet, nftContract, tokenId, bidMon }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "placeBid",
        args: [nftContract, BigInt(tokenId)],
        value: parseEther(String(bidMon)),
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

export { sameAddr, norm as normalizeAddress, readClient as nftReadClient, ERC721_ABI };

/* ====================== NFT ESCROW REFUNDS (Model B) ==================== */

/** Queued refund for a bidder on an NFT listing (pull-based). */
export async function readNftRefund(nftContract, tokenId, bidderAddress) {
    const r = await readClient.readContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "refundOf",
        args: [nftContract, BigInt(tokenId), bidderAddress],
    });
    return r;
}

/** Withdraw a queued refund from the NFT escrow (bidder signs, gas on them). */
export async function withdrawNftRefundOnchain({ wallet, nftContract, tokenId }) {
    const client = await walletClientFrom(wallet);
    const hash = await client.writeContract({
        address: NFT_ESCROW_ADDRESS,
        abi: NFT_ESCROW_ABI,
        functionName: "claimRefund",
        args: [nftContract, BigInt(tokenId)],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}
