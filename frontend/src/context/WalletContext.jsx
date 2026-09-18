import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    PrivyProvider,
    usePrivy,
    useWallets,
    useCreateWallet,
    useSubscribeToJwtAuthWithFlag,
} from "@privy-io/react-auth";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { monadChain, MONAD, publicClient, isEvmAddress, formatMon } from "@/lib/monad";
import { sendNativeTransaction, signPersonalMessage } from "@/lib/wallet";

/**
 * BIDZONE Phase 6.3 — Embedded Wallet layer.
 *
 * States:  idle (signed out) | provisioning | ready | unavailable | error
 *          (+ balance=null with honest UI when the RPC read is not possible)
 *
 * Provider: Privy embedded wallets, provisioned from the VERIFIED Supabase
 * session JWT (Google identity). Wallet provisioning is idempotent by
 * construction: same verified identity -> same wallet, and the guard below
 * prevents concurrent/duplicate creation. Only the PUBLIC address is ever
 * persisted (profiles.wallet_address); signing material never leaves the
 * provider infrastructure.
 *
 * When REACT_APP_PRIVY_APP_ID is absent the layer is honestly "unavailable"
 * — no wallet is simulated, no fake address is ever shown.
 */

const WalletContext = createContext(null);

function makeUnavailableValue(reason) {
    return {
        status: "unavailable",
        address: null,
        balance: null,
        error: null,
        reason,
        initializeWallet: async () => {
            throw new Error("Embedded wallet is not configured");
        },
        getWalletAddress: () => null,
        getBalance: async () => null,
        refreshBalance: async () => {},
        signTransaction: async () => {
            throw new Error("Embedded wallet is not configured");
        },
        signMessage: async () => {
            throw new Error("Embedded wallet is not configured");
        },
    };
}

/** Static unavailable value (stable identity; no hooks required). */
const UNAVAILABLE_VALUE = makeUnavailableValue("WALLET_PROVIDER_NOT_CONFIGURED");

export function WalletProvider({ children }) {
    const privyAppId = process.env.REACT_APP_PRIVY_APP_ID;
    const { isLoading: authLoading } = useAuth();

    if (!privyAppId) {
        return (
            <WalletContext.Provider value={UNAVAILABLE_VALUE}>
                {children}
            </WalletContext.Provider>
        );
    }

    return (
        <PrivyProvider
            appId={privyAppId}
            config={{
                customAuth: {
                    enabled: true,
                    isLoading: Boolean(authLoading),
                    getCustomAccessToken: async () => {
                        if (!supabase) return undefined;
                        const { data } = await supabase.auth.getSession();
                        return data && data.session
                            ? data.session.access_token
                            : undefined;
                    },
                },
                defaultChain: monadChain,
                supportedChains: [monadChain],
                // Custom-JWT login does NOT auto-provision; we provision
                // explicitly and idempotently in PrivyWalletDomain.
                embeddedWallets: { ethereum: { createOnLogin: "off" } },
            }}
        >
            <PrivyWalletDomain>{children}</PrivyWalletDomain>
        </PrivyProvider>
    );
}

function PrivyWalletDomain({ children }) {
    const { ready, authenticated } = usePrivy();
    const { wallets } = useWallets();
    const { createWallet } = useCreateWallet();
    const { isAuthed, isLoading: authLoading } = useAuth();
    const qc = useQueryClient();

    const [status, setStatus] = useState("idle");
    const [address, setAddress] = useState(null);
    const [balance, setBalance] = useState(null);
    const [error, setError] = useState(null);
    const provisioning = useRef(false);

    // Sync the Supabase (Google) session into Privy.
    useSubscribeToJwtAuthWithFlag({
        isAuthenticated: isAuthed,
        isLoading: authLoading,
        enabled: true,
        getExternalJwt: async () => {
            if (!supabase) return undefined;
            const { data } = await supabase.auth.getSession();
            return data && data.session ? data.session.access_token : undefined;
        },
    });

    // Idempotent provisioning: find-or-create the Privy embedded EVM wallet.
    useEffect(() => {
        if (!ready || !isAuthed) {
            setStatus("idle");
            setAddress(null);
            setBalance(null);
            setError(null);
            return;
        }
        const existing = wallets.find((w) => w.walletClientType === "privy");
        if (existing) {
            setStatus("ready");
            setAddress(existing.address);
            setError(null);
            return;
        }
        if (provisioning.current) return;
        provisioning.current = true;
        setStatus("provisioning");
        setError(null);
        (async () => {
            const wallet = await createWallet({ createAdditional: false });
            if (!isEvmAddress(wallet.address)) {
                throw new Error("Provider returned an invalid wallet address");
            }
            setAddress(wallet.address);
            setStatus("ready");
            await linkWalletToProfile(wallet.address);
        })()
            .catch((e) => {
                setError((e && e.message) || "Wallet provisioning failed");
                setStatus("error");
            })
            .finally(() => {
                provisioning.current = false;
            });
    }, [ready, authenticated, isAuthed, wallets, createWallet]);

    /** Persist ONLY the public address to the caller's own profile row. */
    async function linkWalletToProfile(addr) {
        if (!supabase) return;
        const { data: sessData } = await supabase.auth.getSession();
        if (!(sessData && sessData.session)) return;
        const uid = sessData.session.user.id;
        const { data: profile } = await supabase
            .from("profiles")
            .select("id, wallet_address")
            .eq("id", uid)
            .maybeSingle();
        if (profile && !profile.wallet_address) {
            await supabase
                .from("profiles")
                .update({ wallet_address: addr })
                .eq("id", uid);
            qc.invalidateQueries({ queryKey: ["profile", uid] });
        }
    }

    const refreshBalance = useCallback(async () => {
        if (!address) return null;
        try {
            const wei = await publicClient.getBalance({ address });
            const formatted = formatMon(wei);
            setBalance(formatted);
            return formatted;
        } catch {
            // Honest state: balance unknown (RPC unreachable / not funded /
            // Monad integration not active yet). Never fabricate a value.
            setBalance(null);
            return null;
        }
    }, [address]);

    useEffect(() => {
        if (status === "ready" && address) refreshBalance();
    }, [status, address, refreshBalance]);

    const signTransaction = useCallback(
        async ({ to, valueMon }) => {
            const wallet = wallets.find((w) => w.walletClientType === "privy");
            return sendNativeTransaction({ wallet, to, valueMon });
        },
        [wallets]
    );

    const signMessage = useCallback(
        async (message) => {
            const wallet = wallets.find((w) => w.walletClientType === "privy");
            return signPersonalMessage({ wallet, message });
        },
        [wallets]
    );

    const value = useMemo(
        () => ({
            status: isAuthed ? status : "idle",
            address,
            balance,
            error,
            initializeWallet: async () => {
                if (!address) await refreshBalance();
                return address;
            },
            getWalletAddress: () => address,
            getBalance: async () => balance,
            refreshBalance,
            signTransaction,
            signMessage,
        }),
        [isAuthed, status, address, balance, error, refreshBalance, signTransaction, signMessage]
    );

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
    const ctx = useContext(WalletContext);
    if (!ctx) throw new Error("useWallet must be used within WalletProvider");
    return ctx;
}
