import { createWalletClient, custom, parseEther } from "viem";
import { monadChain, MONAD, isEvmAddress } from "@/lib/monad";

/**
 * BIDZONE Phase 6.3 — wallet service (blockchain operations, UI-free).
 *
 * All signing goes through the embedded-wallet provider's EIP-1193 provider
 * wrapped by viem — no custom key management anywhere in BIDZONE. Private
 * keys / seed phrases never exist in this codebase; the provider (Privy)
 * holds signing material in its own secure infrastructure.
 */

/**
 * Send a native MON transaction through the embedded wallet's EIP-1193
 * provider. `to` must be a checksum-valid EVM address; value is in MON
 * (string). Returns the transaction hash. The provider wallet MUST already
 * be switched to the configured Monad chain.
 */
export async function sendNativeTransaction({ wallet, to, valueMon }) {
    if (!wallet) throw new Error("No embedded wallet available");
    if (!isEvmAddress(to)) throw new Error("Invalid recipient address");
    if (!valueMon || isNaN(Number(valueMon)) || Number(valueMon) <= 0) {
        throw new Error("Invalid amount");
    }
    await wallet.switchChain(MONAD.chainId);
    const provider = await wallet.getEthereumProvider();
    const client = createWalletClient({
        account: wallet.address,
        chain: monadChain,
        transport: custom(provider),
    });
    return client.sendTransaction({
        to,
        value: parseEther(String(valueMon)),
    });
}

/** Sign an arbitrary personal message through the embedded wallet. */
export async function signPersonalMessage({ wallet, message }) {
    if (!wallet) throw new Error("No embedded wallet available");
    await wallet.switchChain(MONAD.chainId);
    const provider = await wallet.getEthereumProvider();
    const client = createWalletClient({
        account: wallet.address,
        chain: monadChain,
        transport: custom(provider),
    });
    return client.signMessage({ message });
}
