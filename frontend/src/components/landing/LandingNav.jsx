import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Menu, X, ChevronRight, Gavel } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Phase Polish 1 — dedicated logged-out landing navigation.
// Reuses the existing auth pattern (single-identity Google modal via
// openAuthModal) and existing routes only — no new routes, no duplication.
// The app-wide Header stays untouched for the authenticated experience.
const LINKS = [
    // Explore: browsing live auctions is the authenticated Home experience —
    // open the existing auth modal and land the new user on the live listing.
    { label: "Explore", auth: true },
    { label: "How It Works", to: { pathname: "/", hash: "#how-it-works" } },
    { label: "About", to: { pathname: "/", hash: "#about" } },
];

export function LandingNav() {
    const [open, setOpen] = useState(false);
    const { openAuthModal } = useAuth();

    return (
        <>
            <header
                data-testid="landing-nav"
                className="sticky top-0 z-50 border-b border-white/[0.06] bg-[hsl(var(--bz-bg))]/85 backdrop-blur-xl"
            >
                <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:h-20 md:px-8">
                    <Link
                        to="/"
                        data-testid="landing-logo"
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
                            <span className="hidden sm:inline-block text-[10px] uppercase tracking-[0.18em] text-white/40">
                                Real-Time Social Auction
                            </span>
                        </span>
                    </Link>

                    <nav
                        aria-label="Landing"
                        className="hidden md:flex items-center gap-1 text-sm ml-6"
                    >
                        {LINKS.map((l) =>
                            l.auth ? (
                                <button
                                    key={l.label}
                                    type="button"
                                    data-testid="landing-nav-explore"
                                    onClick={() =>
                                        openAuthModal({
                                            returnTo: "/?tab=all#live-auctions",
                                        })
                                    }
                                    className="rounded-full px-3 py-2 text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
                                >
                                    {l.label}
                                </button>
                            ) : (
                                <Link
                                    key={l.label}
                                    to={l.to}
                                    data-testid={`landing-nav-${l.label
                                        .toLowerCase()
                                        .replace(/\s+/g, "-")}`}
                                    className="rounded-full px-3 py-2 text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
                                >
                                    {l.label}
                                </Link>
                            )
                        )}
                    </nav>

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            data-testid="landing-login"
                            onClick={() => openAuthModal({ returnTo: "/" })}
                            className="hidden sm:inline-flex items-center h-10 px-5 rounded-full bz-btn-secondary text-sm font-medium"
                        >
                            Log In
                        </button>
                        <button
                            type="button"
                            data-testid="landing-get-started"
                            onClick={() => openAuthModal({ returnTo: "/" })}
                            className="hidden sm:inline-flex items-center gap-2 h-10 px-5 rounded-full bz-btn-primary text-sm font-semibold"
                        >
                            <Gavel className="h-4 w-4" />
                            Get Started
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            data-testid="landing-mobile-menu"
                            aria-label="Open menu"
                            className="md:hidden h-10 w-10 rounded-full border border-white/[0.08] bg-[hsl(var(--bz-surface))]/60 flex items-center justify-center"
                        >
                            <Menu className="h-4 w-4 text-white/70" />
                        </button>
                    </div>
                </div>
            </header>

            {open && (
                <div
                    className="md:hidden fixed inset-0 z-[60]"
                    data-testid="landing-mobile-drawer"
                    role="dialog"
                    aria-modal="true"
                >
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setOpen(false)}
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    />
                    <div className="absolute right-0 top-0 h-full w-[86%] max-w-xs bg-[hsl(var(--bz-bg))] border-l border-white/10 p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-8">
                            <span className="font-display text-lg font-bold">BIDZONE</span>
                            <button
                                onClick={() => setOpen(false)}
                                aria-label="Close menu"
                                data-testid="landing-mobile-close"
                                className="h-9 w-9 rounded-full border border-white/10 flex items-center justify-center"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <nav className="flex flex-col gap-1">
                            {LINKS.map((l) =>
                                l.auth ? (
                                    <button
                                        key={l.label}
                                        type="button"
                                        data-testid="landing-nav-explore-m"
                                        onClick={() => {
                                            setOpen(false);
                                            openAuthModal({
                                                returnTo: "/?tab=all#live-auctions",
                                            });
                                        }}
                                        className="flex items-center justify-between rounded-xl px-4 py-3 text-left text-white/80 hover:text-white hover:bg-white/[0.04] transition"
                                    >
                                        <span className="text-sm font-medium">{l.label}</span>
                                        <ChevronRight className="h-4 w-4 text-white/30" />
                                    </button>
                                ) : (
                                    <Link
                                        key={l.label}
                                        to={l.to}
                                        onClick={() => setOpen(false)}
                                        className="flex items-center justify-between rounded-xl px-4 py-3 text-white/80 hover:text-white hover:bg-white/[0.04] transition"
                                    >
                                        <span className="text-sm font-medium">{l.label}</span>
                                        <ChevronRight className="h-4 w-4 text-white/30" />
                                    </Link>
                                )
                            )}
                        </nav>
                        <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col gap-3">
                            <button
                                type="button"
                                data-testid="landing-mobile-login"
                                onClick={() => {
                                    setOpen(false);
                                    openAuthModal({ returnTo: "/" });
                                }}
                                className="w-full inline-flex items-center justify-center h-11 rounded-full bz-btn-secondary text-sm font-medium"
                            >
                                Log In
                            </button>
                            <button
                                type="button"
                                data-testid="landing-mobile-get-started"
                                onClick={() => {
                                    setOpen(false);
                                    openAuthModal({ returnTo: "/" });
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bz-btn-primary text-sm font-semibold"
                            >
                                <Gavel className="h-4 w-4" /> Get Started
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
