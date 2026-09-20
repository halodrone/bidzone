import { createPublicClient, createWalletClient, custom, http, keccak256, parseEther, formatEther, toBytes } from "viem";
import BIDZONE_ABI from "@/lib/contracts/BidzoneAuction.abi.json";
import { monadChain, MONAD } from "@/lib/monad";

/**
 * BIDZONE Phase 6.5 — thin viem wrapper around the on-chain auction escrow.
 *
 * ALL on-chain calls flow through here so the rest of the app never touches
 * ABIs directly. Public reads use the injected RPC; writes go through the
 * embedded wallet's EIP-1193 provider (Privy).
 */

/** Read-only client — used for on-chain state / receipt polling. */
export const readClient = createPublicClient({
    chain: monadChain,
    transport: http(MONAD.rpcUrl),
});

/** True when Phase 6.5 on-chain path is configured (contract address set). */
export const isOnchainAvailable = () => Boolean(MONAD.contractAddress);

/**
 * Deterministic bytes32 auction id derived from a Supabase auction UUID.
 * Uses keccak256 of the raw UUID string (case-preserved). The DB stores
 * the derived hex string in `auctions.contract_auction_id` for lookups.
 */
export function auctionIdFromUuid(uuid) {
    if (!uuid) throw new Error("auctionIdFromUuid: uuid required");
    return keccak256(toBytes(String(uuid)));
}

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

/** on-chain read: full auction record. */
export async function readAuction(uuid) {
    if (!isOnchainAvailable()) return null;
    const id = auctionIdFromUuid(uuid);
    const raw = await readClient.readContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "getAuction",
        args: [id],
    });
    return raw;
}

/** on-chain read: refund owed to an address for an auction. */
export async function readRefund(uuid, address) {
    if (!isOnchainAvailable() || !address) return 0n;
    const id = auctionIdFromUuid(uuid);
    return readClient.readContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "refundOf",
        args: [id, address],
    });
}

/**
 * Phase 6.5b — on-chain read: auction status.
 * Returns the Status enum value (0 = Status.None = NOT registered on-chain),
 * or null when the on-chain path is not configured.
 */
export async function readAuctionStatus(uuid) {
    if (!isOnchainAvailable()) return null;
    const id = auctionIdFromUuid(uuid);
    const status = await readClient.readContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "statusOf",
        args: [id],
    });
    // viem decodes uint8 outputs as JS `number`, while callers compare against
    // `0n` (BigInt). `0 !== 0n` is TRUE in JS (different types), which made
    // every unregistered auction look registered (false-positive reconcile,
    // Phase 6.5b bug). Normalize to BigInt at the source — matches the
    // documented return contract ("Status enum value", 0 = Status.None).
    return status == null ? null : BigInt(status);
}

/**
 * Resilient receipt wait — the public Monad RPC drops requests under polling,
 * which made post-tx Supabase mirrors silently fail (bid/registration rows
 * never written while the chain state was fine). Retry with a generous
 * timeout; rethrows the last error if all attempts fail.
 */
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
            await new Promise((r) => setTimeout(r, 1_500 * (attempt + 1)));
        }
    }
    throw lastErr;
}

/** Seller creates an on-chain auction (used at publish time by seller flow). */
export async function createAuctionOnchain({ wallet, uuid, startingBidMon, minimumIncrementMon, startTime, endTime, antiSnipeSeconds }) {
    const client = await walletClientFrom(wallet);
    const id = auctionIdFromUuid(uuid);
    const hash = await client.writeContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "createAuction",
        args: [
            id,
            parseEther(String(startingBidMon)),
            parseEther(String(minimumIncrementMon)),
            BigInt(Math.floor(new Date(startTime).getTime() / 1000)),
            BigInt(Math.floor(new Date(endTime).getTime() / 1000)),
            Number(antiSnipeSeconds || 10),
        ],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Bidder places an on-chain bid. msg.value = bidMon. */
export async function placeBidOnchain({ wallet, uuid, bidMon }) {
    const client = await walletClientFrom(wallet);
    const id = auctionIdFromUuid(uuid);
    const hash = await client.writeContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "placeBid",
        args: [id],
        value: parseEther(String(bidMon)),
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Anyone settles the auction after endTime. */
export async function settleAuctionOnchain({ wallet, uuid }) {
    const client = await walletClientFrom(wallet);
    const id = auctionIdFromUuid(uuid);
    const hash = await client.writeContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "settleAuction",
        args: [id],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Outbid bidder withdraws their escrow. */
export async function withdrawRefundOnchain({ wallet, uuid }) {
    const client = await walletClientFrom(wallet);
    const id = auctionIdFromUuid(uuid);
    const hash = await client.writeContract({
        address: MONAD.contractAddress,
        abi: BIDZONE_ABI,
        functionName: "withdrawRefund",
        args: [id],
    });
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
}

/** Convenience formatters exposed for panels. */
export const fromWei = (v) => (v == null ? null : formatEther(v));
export const toExplorerTx = (hash) => `${MONAD.explorer.replace(/\/$/, "")}/tx/${hash}`;
