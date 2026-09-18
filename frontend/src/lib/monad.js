import { defineChain, createPublicClient, http, formatEther } from "viem";

/**
 * BIDZONE Phase 6.3 — Monad chain configuration (environment-driven).
 *
 * Single source of truth for ALL chain values. Testnet values are defaults
 * for the current phase; mainnet becomes a matter of env overrides in a
 * later phase. NEVER hard-code these values in components.
 */

export const MONAD = {
    chainId: Number(process.env.REACT_APP_MONAD_CHAIN_ID || 10143),
    rpcUrl: process.env.REACT_APP_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
    currency: process.env.REACT_APP_MONAD_CURRENCY || "MON",
    explorer: process.env.REACT_APP_MONAD_EXPLORER_URL || "https://testnet.monadscan.com",
    // Auction settlement contract — deployed/linked in Phase 6.5. Empty = not deployed.
    contractAddress: process.env.REACT_APP_MONAD_CONTRACT_ADDRESS || "",
    networkName: process.env.REACT_APP_MONAD_NETWORK || "Monad Testnet",
};

export const monadChain = defineChain({
    id: MONAD.chainId,
    name: MONAD.networkName,
    nativeCurrency: { name: "Monad", symbol: MONAD.currency, decimals: 18 },
    rpcUrls: { default: { http: [MONAD.rpcUrl] } },
    blockExplorers: { default: { name: "MonadScan", url: MONAD.explorer } },
    testnet: true,
});

/** Public JSON-RPC client (reads only — balances, chain state). */
export const publicClient = createPublicClient({
    chain: monadChain,
    transport: http(MONAD.rpcUrl),
});

/** Strict EVM address format check (no checksum enforcement at UI level). */
export function isEvmAddress(a) {
    return /^0x[a-fA-F0-9]{40}$/.test(a || "");
}

/** 0x1234…abcd */
export function shortenAddress(a) {
    if (!isEvmAddress(a)) return "";
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Wei (bigint/string) -> "1.234 MON" */
export function formatMon(wei) {
    try {
        return `${formatEther(wei)} ${MONAD.currency}`;
    } catch {
        return null;
    }
}
