import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    Search,
    Bell,
    Menu,
    X,
    Sparkles,
    Wallet as WalletIcon,
    ChevronRight,
    LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { shortenAddress, MONAD } from "@/lib/monad";
import { LOGOUT } from "@/constants/testIds";
import { Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const NAV = [
    { label: "Home", href: "/" },
    { label: "Live Zone", href: "/live" },
    { label: "Explore", href: "/explore" },
    { label: "Create Auction", href: "/create" },
];

export function Header() {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <header
            data-testid="bidzone-header"
            className="sticky top-0 z-50 border-b border-white/[0.06] bg-[hsl(var(--bz-bg))]/85 backdrop-blur-xl"
        >
            <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:h-20 md:px-8">
                {/* Logo */}
                <Link
                    to="/"
                    data-testid="bidzone-logo"
                    className="flex items-center gap-3 shrink-0"
                >
                    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--bz-surface))] border border-white/10">
                        <Sparkles
                            className="h-4 w-4 text-[hsl(var(--bz-purple))]"
                            strokeWidth={2.5}
                        />
                        <span className="absolute -inset-px rounded-xl bg-[hsl(var(--bz-purple)/0.15)] blur-md -z-10" />
                    </span>
                    <span className="flex flex-col leading-none">
                        <span className="font-display text-lg font-bold tracking-tight">
                            BIDZONE
                        </span>
                        <span className="hidden md:inline-block text-[10px] uppercase tracking-[0.18em] text-white/40">
                            Real-Time Social Auction
                        </span>
                    </span>
                </Link>

                {/* Center search (desktop) */}
                <div className="hidden lg:flex flex-1 max-w-xl mx-4">
                    <label
                        htmlFor="bz-search"
                        className="group relative flex w-full items-center"
                    >
                        <Search className="absolute left-4 h-4 w-4 text-white/40 group-focus-within:text-[hsl(var(--bz-purple))] transition-colors" />
                        <input
                            id="bz-search"
                            data-testid="header-search-input"
                            type="search"
                            placeholder="Search auctions, items, or sellers..."
                            className="w-full h-11 rounded-full bg-[hsl(var(--bz-surface))]/70 border border-white/[0.08] pl-11 pr-4 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[hsl(var(--bz-purple)/0.6)] focus:bg-[hsl(var(--bz-surface))]"
                        />
                    </label>
                </div>

                {/* Nav (desktop) */}
                <nav
                    aria-label="Primary"
                    className="hidden md:flex items-center gap-1 text-sm"
                >
                    {NAV.map((n) => (
                        <Link
                            key={n.href}
                            to={n.href}
                            data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className="rounded-full px-3 py-2 text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
                        >
                            {n.label}
                        </Link>
                    ))}
                </nav>

                {/* Right cluster */}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        data-testid="header-notifications"
                        aria-label="Notifications"
                        className="relative h-10 w-10 rounded-full border border-white/[0.08] bg-[hsl(var(--bz-surface))]/60 hover:bg-[hsl(var(--bz-surface))] hover:border-white/20 transition flex items-center justify-center"
                    >
                        <Bell className="h-4 w-4 text-white/70" />
                    </button>

                    <WalletButton />

                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        data-testid="header-mobile-menu"
                        aria-label="Open menu"
                        className="md:hidden h-10 w-10 rounded-full border border-white/[0.08] bg-[hsl(var(--bz-surface))]/60 flex items-center justify-center"
                    >
                        <Menu className="h-4 w-4 text-white/70" />
                    </button>
                </div>
            </div>

            {/* Search bar (mobile — under header) */}
            <div className="lg:hidden px-4 pb-3">
                <label htmlFor="bz-search-m" className="group relative flex w-full items-center">
                    <Search className="absolute left-4 h-4 w-4 text-white/40" />
                    <input
                        id="bz-search-m"
                        data-testid="header-search-input-mobile"
                        type="search"
                        placeholder="Search auctions, items, or sellers..."
                        className="w-full h-11 rounded-full bg-[hsl(var(--bz-surface))]/70 border border-white/[0.08] pl-11 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-[hsl(var(--bz-purple)/0.6)]"
                    />
                </label>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <MobileNav onClose={() => setMobileOpen(false)} />
            )}
        </header>
    );
}

function WalletButton() {
    const { isAuthed, profile, user, openAuthModal, signOut } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    if (!isAuthed) {
        return (
            <button
                type="button"
                data-testid="header-wallet"
                onClick={() =>
                    openAuthModal({ returnTo: location.pathname })
                }
                className="hidden sm:inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bz-btn-secondary text-sm"
            >
                <WalletIcon className="h-4 w-4 text-[hsl(var(--bz-purple))]" />
                <span className="font-medium">Sign In</span>
                <span className="hidden md:inline text-white/40">/ Get Started</span>
            </button>
        );
    }

    const name =
        (profile && (profile.display_name || profile.username)) ||
        (user && user.email ? user.email.split("@")[0] : "You");
    const initial = name.slice(0, 1).toUpperCase();

    return (
        <div
            data-testid="header-user-chip"
            className="hidden sm:inline-flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-full bz-btn-secondary text-sm"
        >
            <button
                type="button"
                data-testid="header-wallet-link"
                title="Open wallet"
                onClick={() => navigate("/wallet")}
                className="flex items-center gap-2 outline-none"
            >
                <span className="h-7 w-7 overflow-hidden rounded-full bg-[hsl(var(--bz-surface))] border border-white/10 flex items-center justify-center text-[11px] text-white/80">
                    {profile && profile.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        initial
                    )}
                </span>
                <span className="max-w-[120px] truncate font-medium">{name}</span>
            </button>
            <WalletChip />
            <button
                type="button"
                data-testid={LOGOUT.button}
                aria-label="Sign out"
                title="Sign out"
                onClick={() => signOut()}
                className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition"
            >
                <LogOut className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

/**
 * Phase 6.3 — embedded wallet status inside the authenticated header chip.
 * Honest states only: provisioning spinner / shortened address + copy /
 * "wallet not configured" — never a fabricated address or balance.
 */
function WalletChip() {
    const { status, address, balance } = useWallet();
    const [copied, setCopied] = useState(false);

    if (status === "provisioning") {
        return (
            <span
                data-testid="wallet-chip-provisioning"
                title="Setting up your embedded wallet…"
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/60"
            >
                <Loader2 className="h-3 w-3 animate-spin" /> Wallet…
            </span>
        );
    }
    if (status === "error") {
        return (
            <span
                data-testid="wallet-chip-error"
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--bz-red))]/40 bg-[hsl(var(--bz-red))]/10 px-2 py-1 text-[10px] text-white/75"
                title="Wallet provisioning failed"
            >
                Wallet error
            </span>
        );
    }
    if (status === "unavailable") {
        return (
            <span
                data-testid="wallet-chip-unavailable"
                title="Embedded wallet provider has not been configured yet"
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/50"
            >
                <WalletIcon className="h-3 w-3" /> Wallet pending
            </span>
        );
    }
    if (!address) return null;

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
        <span
            data-testid="wallet-chip-ready"
            title={`${address} — ${balance || "Wallet ready"}`}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/75"
        >
            <span className="text-[hsl(var(--bz-purple))]">◆</span>
            <span data-testid="wallet-address" className="tabular-nums">
                {shortenAddress(address)}
            </span>
            <span className="text-white/40">·</span>
            <span data-testid="wallet-balance" className="text-white/55">
                {balance || "Wallet ready"}
            </span>
            <button
                type="button"
                data-testid="wallet-copy"
                aria-label="Copy wallet address"
                onClick={copyAddress}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-white/50 hover:text-white"
            >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
        </span>
    );
}

function MobileAuthSlot() {
    const { isAuthed, profile, user, openAuthModal, signOut } = useAuth();
    const { status, address, balance } = useWallet();

    if (!isAuthed) {
        return (
            <>
                <button
                    type="button"
                    data-testid="mobile-nav-signin"
                    onClick={() => openAuthModal({ returnTo: "/" })}
                    className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bz-btn-primary text-sm font-semibold"
                >
                    Sign In / Get Started
                </button>
                <p className="text-[11px] text-white/40 mt-3 text-center">
                    One identity for bidding and selling — Google sign-in.
                </p>
            </>
        );
    }

    const name =
        (profile && (profile.display_name || profile.username)) ||
        (user && user.email ? user.email.split("@")[0] : "You");

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                <span className="h-9 w-9 overflow-hidden rounded-full bg-[hsl(var(--bz-surface))] border border-white/10 flex items-center justify-center text-xs text-white/80">
                    {profile && profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                        name.slice(0, 1).toUpperCase()
                    )}
                </span>
                <span className="text-sm font-medium truncate">{name}</span>
            </div>
            {address ? (
                <button
                    type="button"
                    data-testid="mobile-wallet-chip"
                    onClick={() => {
                        navigator.clipboard.writeText(address);
                        toast.success("Wallet address copied");
                    }}
                    className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-left"
                >
                    <span className="text-xs text-white/70 tabular-nums">
                        {address.slice(0, 6)}…{address.slice(-4)}
                    </span>
                    <span className="text-[10px] text-white/45">
                        {balance || MONAD.networkName}
                    </span>
                </button>
            ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-[10px] text-white/45">
                    {status === "provisioning"
                        ? "Setting up embedded wallet…"
                        : "Wallet pending — provider not configured yet"}
                </div>
            )}
            <button
                type="button"
                data-testid={LOGOUT.button}
                onClick={() => signOut()}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bz-btn-secondary text-sm"
            >
                <LogOut className="h-4 w-4" /> Sign Out
            </button>
        </div>
    );
}

function MobileNav({ onClose }) {
    return (
        <div
            className="md:hidden fixed inset-0 z-[60]"
            data-testid="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
        >
            <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <div className="absolute right-0 top-0 h-full w-[86%] max-w-xs bg-[hsl(var(--bz-bg))] border-l border-white/10 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                    <span className="font-display text-lg font-bold">BIDZONE</span>
                    <button
                        onClick={onClose}
                        aria-label="Close menu"
                        className="h-9 w-9 rounded-full border border-white/10 flex items-center justify-center"
                        data-testid="mobile-nav-close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <nav className="flex flex-col gap-1">
                    {NAV.map((n) => (
                        <Link
                            key={n.href}
                            to={n.href}
                            onClick={onClose}
                            data-testid={`mobile-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className="flex items-center justify-between rounded-xl px-4 py-3 text-white/80 hover:text-white hover:bg-white/[0.04] transition"
                        >
                            <span className="text-sm font-medium">{n.label}</span>
                            <ChevronRight className="h-4 w-4 text-white/30" />
                        </Link>
                    ))}
                </nav>
                <div className="mt-8 pt-6 border-t border-white/[0.06]">
                    <MobileAuthSlot />
                </div>
            </div>
        </div>
    );
}
