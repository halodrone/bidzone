import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Check, ExternalLink, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/home/Header";
import { Footer } from "@/components/home/Footer";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { publicClient, MONAD } from "@/lib/monad";
import { MyActivity } from "@/components/profile/MyActivity";

/**
 * BIDZONE Profile (Phase 8 — Security + Profile).
 * Single page combining account identity, embedded-wallet security info and
 * wallet shortcuts. No separate Settings/Security page by design.
 *
 * Transaction History is device-scoped (localStorage `bz_withdraw_history`,
 * written by the /wallet flow) and enriched with the real on-chain receipt
 * status. Server-side history across devices would require privileged
 * Supabase access -> intentionally deferred, no RLS workarounds.
 */

const HISTORY_KEY = "bz_withdraw_history";

function shortAddr(a) {
    return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function shortHash(h) {
    return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

export default function Profile() {
    const { isAuthed, isLoading: authLoading, user, profile, signOut } = useAuth();
    const { status: walletStatus, address, balance, error: walletError } = useWallet();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isAuthed) return;
        let list = [];
        try {
            list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        } catch {
            list = [];
        }
        setRows(Array.isArray(list) ? list.slice(0, 25) : []);
    }, [isAuthed]);

    // Enrich each withdrawal with its real on-chain receipt status.
    useEffect(() => {
        if (!rows.length) return;
        let alive = true;
        (async () => {
            const out = await Promise.all(
                rows.map(async (r) => {
                    for (let i = 0; i < 4; i++) {
                        try {
                            const receipt = await publicClient.getTransactionReceipt({ hash: r.hash });
                            return { ...r, chainStatus: receipt && receipt.status === "success" ? "success" : "failed" };
                        } catch {
                            await new Promise((res) => setTimeout(res, 600));
                        }
                    }
                    return { ...r, chainStatus: "pending" };
                })
            );
            if (alive) setRows(out);
        })();
        return () => {
            alive = false;
        };
    }, [rows.length]);

    if (authLoading) {
        return (
            <div data-testid="page-profile" className="bz-ambient min-h-screen">
                <Header />
                <main className="max-w-2xl mx-auto px-4 py-16 text-white/60">Loading…</main>
                <Footer />
            </div>
        );
    }

    if (!isAuthed) {
        return (
            <div data-testid="page-profile" className="bz-ambient min-h-screen">
                <Header />
                <main className="max-w-2xl mx-auto px-4 py-16">
                    <div className="bz-card p-8 text-center space-y-4">
                        <h1 className="text-2xl font-semibold text-white">Profile</h1>
                        <p className="text-white/60">Sign in to view your account, wallet and security settings.</p>
                        <button
                            type="button"
                            data-testid="profile-signin-cta"
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

    const displayName =
        (profile && (profile.display_name || profile.username)) ||
        (user && user.email ? user.email.split("@")[0] : "You");
    const walletActive = walletStatus === "ready" && Boolean(address);
    const explorerAddr = `${MONAD.explorer.replace(/\/$/, "")}/address/${address || ""}`;

    async function copyAddress() {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            toast.success("Wallet address copied");
            setTimeout(() => setCopied(false), 1600);
        } catch {
            toast.error("Could not copy address");
        }
    }

    return (
        <div data-testid="page-profile" className="bz-ambient min-h-screen">
            <Header />
            <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
                <div className="flex items-center gap-3">
                    <Link to="/" className="text-white/50 hover:text-white text-sm">← Home</Link>
                </div>

                <div>
                    <h1 data-testid="profile-title" className="text-3xl font-semibold text-white">Profile</h1>
                    <p className="text-white/55 mt-1 text-sm">Account, embedded wallet and security overview.</p>
                </div>

                {/* Google Account */}
                <section data-testid="profile-account-card" className="bz-card p-5 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            {profile && profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="h-11 w-11 rounded-full border border-white/10 object-cover" />
                            ) : (
                                <span className="h-11 w-11 rounded-full bg-[hsl(var(--bz-surface))] border border-white/10 flex items-center justify-center text-white/70">
                                    {displayName.slice(0, 1).toUpperCase()}
                                </span>
                            )}
                            <div>
                                <div data-testid="profile-name" className="text-white font-medium">{displayName}</div>
                                <div data-testid="profile-email" className="text-xs text-white/50">{(user && user.email) || "—"}</div>
                            </div>
                        </div>
                        <span
                            data-testid="profile-google-badge"
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] text-white/70"
                        >
                            <svg className="h-3 w-3" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" /></svg>
                            Google connected
                        </span>
                    </div>
                    <button
                        type="button"
                        data-testid="profile-signout"
                        onClick={async () => {
                            await signOut();
                            navigate("/");
                        }}
                        className="bz-btn-secondary h-10 px-5 rounded-full text-sm"
                    >
                        Sign out
                    </button>
                </section>

                {/* Embedded Wallet */}
                <section data-testid="profile-wallet-card" className="bz-card p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-white">Embedded Wallet</h2>
                        <span
                            data-testid="profile-wallet-status"
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] border ${
                                walletActive
                                    ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200"
                                    : "border-white/10 bg-black/25 text-white/60"
                            }`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${walletActive ? "bg-emerald-400" : "bg-white/40"}`} />
                            {walletActive ? "Active" : walletStatus || "Unknown"}
                        </span>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-white/50">Network</span>
                            <span data-testid="profile-network" className="text-white">Monad (chain {MONAD.chainId})</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-white/50">Wallet address</span>
                            <span data-testid="profile-wallet-address" className="font-mono text-white text-xs break-all text-right">
                                {walletActive ? address : "—"}
                            </span>
                        </div>
                    </div>
                    {walletActive && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                data-testid="profile-wallet-copy"
                                onClick={copyAddress}
                                className="bz-btn-secondary h-9 px-3 rounded-full text-xs inline-flex items-center gap-1.5"
                            >
                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copied ? "Copied" : "Copy address"}
                            </button>
                            <a
                                data-testid="profile-explorer-link"
                                href={explorerAddr}
                                target="_blank"
                                rel="noreferrer"
                                className="bz-btn-secondary h-9 px-3 rounded-full text-xs inline-flex items-center gap-1.5"
                            >
                                View on MonadScan <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    )}
                    {walletError && <div className="text-xs text-red-300/90">{walletError}</div>}
                    <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[11px] text-white/55">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-[hsl(var(--bz-purple))]" />
                        <span>
                            Keys are custody-secured inside your Privy embedded wallet. BIDZONE never stores,
                            exports or asks for private keys or seed phrases, and never requires connecting an
                            external wallet.
                        </span>
                    </div>
                </section>

                {/* Wallet / deposit / withdraw */}
                <section data-testid="profile-balance-card" className="bz-card p-5 space-y-3">
                    <h2 className="text-lg font-semibold text-white">Wallet</h2>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-white/50 text-sm">Current balance</span>
                        <span data-testid="profile-balance" className="text-white font-semibold">
                            {balance != null ? balance : "—"}
                        </span>
                    </div>
                    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5 text-xs text-amber-200/90">
                        <strong className="font-semibold">Deposits — Monad Network Only.</strong> Send MON only to
                        your embedded wallet address shown above, on the Monad network. Deposits from other
                        networks cannot be recovered.
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            to="/wallet"
                            data-testid="profile-withdraw-link"
                            className="bz-btn-primary h-10 px-5 rounded-full text-sm inline-flex items-center"
                        >
                            Withdraw MON
                        </Link>
                        <Link
                            to="/wallet"
                            data-testid="profile-wallet-link"
                            className="bz-btn-secondary h-10 px-5 rounded-full text-sm inline-flex items-center"
                        >
                            Open Wallet page
                        </Link>
                    </div>
                </section>

                {/* Transaction history (withdrawals) */}
                <section data-testid="profile-history-card" className="bz-card p-5 space-y-3">
                    <h2 className="text-lg font-semibold text-white">Transaction History</h2>
                    {rows.length === 0 ? (
                        <p data-testid="profile-history-empty" className="text-sm text-white/50">
                            Withdrawals made from this device will appear here with their on-chain status.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {rows.map((r) => (
                                <div
                                    key={r.hash}
                                    data-testid="profile-history-row"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs"
                                >
                                    <div className="min-w-0 space-y-0.5">
                                        <a
                                            data-testid="profile-history-hash"
                                            href={`${MONAD.explorer.replace(/\/$/, "")}/tx/${r.hash}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-white/85 hover:text-white inline-flex items-center gap-1"
                                        >
                                            {shortHash(r.hash)} <ExternalLink className="h-3 w-3 opacity-60" />
                                        </a>
                                        <div className="text-white/40 flex items-center gap-1.5">
                                            <Clock className="h-3 w-3" />
                                            {new Date(r.at).toLocaleString()} → {shortAddr(r.to)}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-white font-semibold">{r.amount} MON</div>
                                        <span
                                            data-testid="profile-history-status"
                                            className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] border ${
                                                r.chainStatus === "success"
                                                    ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200"
                                                    : r.chainStatus === "failed"
                                                    ? "border-red-400/30 bg-red-400/[0.08] text-red-200"
                                                    : "border-white/10 bg-black/25 text-white/60"
                                            }`}
                                        >
                                            {r.chainStatus === "success" ? "Confirmed" : r.chainStatus === "failed" ? "Failed" : "Pending"}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[10px] text-white/35 leading-relaxed">
                        History covers withdrawals signed on this device. A cross-device, server-side ledger
                        requires privileged database access and is intentionally not implemented to keep RLS
                        strict.
                    </p>
                </section>

                {/* Phase 7 — MY ACTIVITY: bids, purchases (fulfillment) and sales */}
                <MyActivity />
            </main>
            <Footer />
        </div>
    );
}
