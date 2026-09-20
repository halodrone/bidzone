import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseEther, formatEther } from "viem";
import { toast } from "sonner";
import { Header } from "@/components/home/Header";
import { Footer } from "@/components/home/Footer";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { publicClient, isEvmAddress, MONAD } from "@/lib/monad";

/**
 * BIDZONE Wallet / Withdraw (Phase 7).
 *
 * Withdraw native MON from the user's EXISTING Privy embedded wallet to an
 * EXTERNAL destination address on Monad. Reuses the Phase 6.3 wallet layer
 * (signTransaction -> sendNativeTransaction via the EIP-1193 provider) —
 * no new wallet system, no key export, no external wallet connection.
 * The destination is any Monad-compatible EVM address the user controls
 * off-platform.
 */

// Conservative fallback gas reserve (MON) when the dynamic estimate is
// unavailable. Real transfers on Monad are far cheaper; this only caps the
// max sendable so the tx can never fail for lack of gas.
const FALLBACK_GAS_RESERVE_MON = 0.06;

function shortAddr(a) {
    return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function Wallet() {
    const { isAuthed, isLoading: authLoading } = useAuth();
    const { status: walletStatus, address, balance, error: walletError, refreshBalance, signTransaction } = useWallet();
    const navigate = useNavigate();

    const [step, setStep] = useState("form"); // form | confirm | sent
    const [to, setTo] = useState("");
    const [amount, setAmount] = useState("");
    const [gasReserveMon, setGasReserveMon] = useState(FALLBACK_GAS_RESERVE_MON);
    const [sending, setSending] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const [txStatus, setTxStatus] = useState(null); // pending | success | failed
    const [fieldError, setFieldError] = useState(null);

    const walletReady = walletStatus === "ready" && Boolean(address);
    // formatMon() returns "0.15... MON" — parseFloat stops at the unit suffix,
    // so NaN can never leak into the balance math (a NaN comparison silently
    // disabled the exceeds-balance validation).
    const balanceNum = balance != null ? parseFloat(String(balance)) : null;
    const maxSendable = balanceNum != null && !isNaN(balanceNum) ? Math.max(0, balanceNum - gasReserveMon) : null;

    // Dynamic gas estimate (only needs a valid destination + amount).
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (!isEvmAddress(to)) return;
                const value = parseEther(String(Number(amount) > 0 ? amount : "0"));
                const [gas, price] = await Promise.all([
                    publicClient.estimateGas({ to, value }),
                    publicClient.getGasPrice(),
                ]);
                if (alive) setGasReserveMon(Number(formatEther((gas * price * 120n) / 100n)));
            } catch {
                // keep the conservative fallback; never block the UI on estimates
            }
        })();
        return () => {
            alive = false;
        };
    }, [to, amount]);

    const validationError = useMemo(() => {
        if (step !== "form" && step !== "confirm") return null;
        if (!walletReady) return "Embedded wallet is not ready";
        if (!isEvmAddress(to)) return "Destination must be a valid EVM address";
        if (to.toLowerCase() === address.toLowerCase()) return "Destination must be an external address, not this wallet";
        const n = Number(amount);
        if (!amount || isNaN(n) || n <= 0) return "Amount must be greater than 0";
        if (maxSendable != null && n > maxSendable) {
            return `Amount exceeds available balance (max ${maxSendable.toFixed(6)} MON incl. gas reserve)`;
        }
        if (maxSendable == null) return "Balance unavailable — cannot verify funds";
        return null;
    }, [step, walletReady, to, address, amount, maxSendable]);

    async function confirmAndSend() {
        if (sending || validationError) return;
        setSending(true);
        setFieldError(null);
        try {
            const hash = await signTransaction({ to, valueMon: amount });
            setTxHash(hash);
            setTxStatus("pending");
            setStep("sent");
            toast.info("Transaction submitted", { description: "Waiting for confirmation on Monad…" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000, pollingInterval: 1_000 });
            if (receipt && receipt.status === "success") {
                setTxStatus("success");
                toast.success("Withdrawal confirmed", { description: `${amount} MON sent to ${shortAddr(to)}` });
            } else {
                setTxStatus("failed");
                toast.error("Withdrawal failed on-chain");
            }
            await refreshBalance();
        } catch (e) {
            const msg = (e && (e.shortMessage || e.message)) || "Withdrawal failed";
            if (txHash) {
                setTxStatus("failed");
                setStep("sent");
            } else {
                setFieldError(String(msg).slice(0, 160));
                toast.error("Withdrawal failed", { description: String(msg).slice(0, 120) });
            }
            await refreshBalance();
        } finally {
            setSending(false);
        }
    }

    if (authLoading) {
        return (
            <div data-testid="page-wallet" className="bz-ambient min-h-screen">
                <Header />
                <main className="max-w-2xl mx-auto px-4 py-16 text-white/60">Loading…</main>
                <Footer />
            </div>
        );
    }

    if (!isAuthed) {
        return (
            <div data-testid="page-wallet" className="bz-ambient min-h-screen">
                <Header />
                <main className="max-w-2xl mx-auto px-4 py-16">
                    <div className="bz-card p-8 text-center space-y-4">
                        <h1 className="text-2xl font-semibold text-white">Wallet</h1>
                        <p className="text-white/60">Sign in to view your embedded wallet and withdraw MON.</p>
                        <button
                            type="button"
                            data-testid="wallet-signin-cta"
                            onClick={() => navigate("/")}
                            className="bz-btn-primary px-6 h-11 rounded-full"
                        >
                            Back to auctions
                        </button>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div data-testid="page-wallet" className="bz-ambient min-h-screen">
            <Header />
            <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
                <div className="flex items-center gap-3">
                    <Link to="/" className="text-white/50 hover:text-white text-sm">← Home</Link>
                </div>

                <div>
                    <h1 data-testid="wallet-title" className="text-3xl font-semibold text-white">Wallet</h1>
                    <p className="text-white/55 mt-1 text-sm">Your BIDZONE embedded wallet — withdraw MON to an external Monad address.</p>
                </div>

                {/* Embedded wallet card */}
                <div data-testid="wallet-card" className="bz-card p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-[11px] uppercase tracking-wider text-white/45">Embedded wallet address</div>
                            <div data-testid="wallet-address-chip" className="font-mono text-white text-sm mt-1 break-all">
                                {walletReady ? address : "—"}
                            </div>
                        </div>
                        {walletReady && (
                            <button
                                type="button"
                                data-testid="wallet-copy-address"
                                onClick={() => {
                                    navigator.clipboard && navigator.clipboard.writeText(address);
                                    toast.success("Address copied");
                                }}
                                className="bz-btn-secondary h-9 px-3 rounded-full text-xs"
                            >
                                Copy
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                        <div className="text-[11px] uppercase tracking-wider text-white/45">Available balance</div>
                        <div data-testid="wallet-balance" className="text-white font-semibold">
                            {balance != null ? balance : "—"}
                        </div>
                    </div>
                    {walletError && (
                        <div data-testid="wallet-error" className="text-xs text-red-300/90">{walletError}</div>
                    )}
                </div>

                {/* Network warning */}
                <div
                    data-testid="wallet-network-warning"
                    className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-200/90"
                >
                    <strong className="font-semibold">Monad Network Only.</strong> This wallet lives on Monad
                    (chain {MONAD.chainId}). Send only to Monad-compatible EVM addresses — transfers to
                    other networks or exchanges without Monad support can result in permanent loss.
                </div>

                {/* Withdraw flow */}
                <div data-testid="wallet-withdraw-card" className="bz-card p-5 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Withdraw MON</h2>

                    {step === "sent" ? (
                        <div className="space-y-4">
                            <div
                                data-testid="wallet-tx-status"
                                className={`rounded-2xl px-4 py-3 text-sm border ${
                                    txStatus === "success"
                                        ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200"
                                        : txStatus === "failed"
                                        ? "border-red-400/30 bg-red-400/[0.08] text-red-200"
                                        : "border-white/10 bg-white/[0.04] text-white/80"
                                }`}
                            >
                                {txStatus === "success" && "Withdrawal confirmed. The funds have left your embedded wallet."}
                                {txStatus === "failed" && "The transaction failed or was rejected on-chain. Your balance is unchanged apart from gas."}
                                {txStatus === "pending" && "Transaction pending… do not close this page."}
                            </div>
                            {txHash && (
                                <div className="text-xs text-white/60 space-y-1">
                                    <div className="text-[11px] uppercase tracking-wider text-white/45">Transaction hash</div>
                                    <div data-testid="wallet-tx-hash" className="font-mono break-all text-white/85">{txHash}</div>
                                    <a
                                        data-testid="wallet-tx-link"
                                        href={`${MONAD.explorer.replace(/\/$/, "")}/tx/${txHash}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-block mt-1 text-[hsl(var(--bz-purple))] hover:underline"
                                    >
                                        View on explorer ↗
                                    </a>
                                </div>
                            )}
                            <button
                                type="button"
                                data-testid="wallet-new-withdrawal"
                                onClick={() => {
                                    setStep("form");
                                    setTxHash(null);
                                    setTxStatus(null);
                                    setTo("");
                                    setAmount("");
                                }}
                                className="bz-btn-secondary h-10 px-4 rounded-full text-sm"
                            >
                                New withdrawal
                            </button>
                        </div>
                    ) : step === "confirm" ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-white/[0.08] divide-y divide-white/[0.06] text-sm">
                                <div className="flex justify-between gap-4 px-4 py-3">
                                    <span className="text-white/50">To (external address)</span>
                                    <span data-testid="wallet-confirm-to" className="font-mono text-white break-all text-right">{to}</span>
                                </div>
                                <div className="flex justify-between gap-4 px-4 py-3">
                                    <span className="text-white/50">Amount</span>
                                    <span data-testid="wallet-confirm-amount" className="text-white font-semibold">{Number(amount)} MON</span>
                                </div>
                                <div className="flex justify-between gap-4 px-4 py-3">
                                    <span className="text-white/50">Network</span>
                                    <span className="text-white">Monad (chain {MONAD.chainId})</span>
                                </div>
                                <div className="flex justify-between gap-4 px-4 py-3">
                                    <span className="text-white/50">Estimated gas</span>
                                    <span className="text-white/80">≈ {gasReserveMon.toFixed(6)} MON (paid by sender)</span>
                                </div>
                            </div>
                            <p className="text-xs text-white/50">
                                The transaction is signed by your embedded wallet through Privy. You will see a
                                Privy approval popup — approve it to broadcast.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    data-testid="wallet-confirm-button"
                                    disabled={sending || Boolean(validationError)}
                                    onClick={confirmAndSend}
                                    className="bz-btn-primary h-11 px-6 rounded-full disabled:opacity-50"
                                >
                                    {sending ? "Submitting…" : "Confirm & Send"}
                                </button>
                                <button
                                    type="button"
                                    data-testid="wallet-confirm-back"
                                    disabled={sending}
                                    onClick={() => setStep("form")}
                                    className="bz-btn-secondary h-11 px-5 rounded-full text-sm disabled:opacity-50"
                                >
                                    Back
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <label className="block space-y-1.5">
                                <span className="text-xs text-white/55">Destination address (external, Monad EVM)</span>
                                <input
                                    data-testid="wallet-dest-input"
                                    type="text"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value.trim())}
                                    placeholder="0x…"
                                    className="w-full h-11 rounded-xl bg-[hsl(var(--bz-surface))]/70 border border-white/[0.08] px-3 font-mono text-sm text-white placeholder:text-white/30 outline-none focus:border-[hsl(var(--bz-purple)/0.6)]"
                                />
                            </label>
                            <label className="block space-y-1.5">
                                <span className="text-xs text-white/55">
                                    Amount (MON) — max available {maxSendable != null ? maxSendable.toFixed(6) : "—"} after gas reserve
                                </span>
                                <input
                                    data-testid="wallet-amount-input"
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full h-11 rounded-xl bg-[hsl(var(--bz-surface))]/70 border border-white/[0.08] px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[hsl(var(--bz-purple)/0.6)]"
                                />
                            </label>
                            {fieldError && (
                                <div data-testid="wallet-field-error" className="text-xs text-red-300/90">{fieldError}</div>
                            )}
                            {validationError && step === "form" && to && amount && (
                                <div data-testid="wallet-validation-error" className="text-xs text-amber-300/90">{validationError}</div>
                            )}
                            <button
                                type="button"
                                data-testid="wallet-review-button"
                                disabled={!to || !amount || Boolean(validationError)}
                                onClick={() => setStep("confirm")}
                                className="bz-btn-primary h-11 px-6 rounded-full disabled:opacity-50"
                            >
                                Review withdrawal
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-white/35 leading-relaxed">
                    BIDZONE never exports private keys or seed phrases, and never asks you to connect an
                    external wallet for withdrawals — signing happens inside your embedded wallet through
                    the Privy secure infrastructure.
                </p>
            </main>
            <Footer />
        </div>
    );
}
