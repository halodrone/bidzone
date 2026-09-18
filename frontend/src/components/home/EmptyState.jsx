import { Link } from "react-router-dom";
import { Sparkles, Radio, Timer, TrendingUp, LayoutGrid } from "lucide-react";

const COPY = {
    live: {
        icon: Radio,
        title: "Nothing is live yet.",
        subtitle: "Be the first to create an auction and start the action.",
    },
    "ending-soon": {
        icon: Timer,
        title: "No auctions ending soon.",
        subtitle: "The auctions ending in the next hour will show up here.",
    },
    trending: {
        icon: TrendingUp,
        title: "Nothing's trending right now.",
        subtitle: "Once auctions start attracting bids, they'll appear here.",
    },
    all: {
        icon: LayoutGrid,
        title: "The zone is quiet.",
        subtitle: "New auctions will appear here — live and upcoming.",
    },
};

export function EmptyState({ variant = "live", configured = true }) {
    const { icon: Icon, title, subtitle } = COPY[variant] || COPY.live;

    return (
        <div
            data-testid={`empty-state-${variant}`}
            className="relative mx-auto flex max-w-2xl flex-col items-center rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent px-6 py-14 text-center"
        >
            {/* Soft purple glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-[hsl(var(--bz-purple)/0.25)] blur-3xl"
            />

            <div className="relative bz-icon-frame !h-16 !w-16 !rounded-2xl">
                <Icon className="h-7 w-7" strokeWidth={1.5} />
                <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
            </div>

            <h3 className="mt-6 font-display text-2xl font-bold">{title}</h3>
            <p className="mt-2 max-w-md text-sm text-white/55">{subtitle}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                    to="/create"
                    data-testid={`empty-state-cta-${variant}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-primary px-6 py-3 text-sm font-semibold"
                >
                    Create Your First Auction
                </Link>
                <Link
                    to="/explore"
                    data-testid={`empty-state-explore-${variant}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-secondary px-6 py-3 text-sm font-semibold"
                >
                    Explore Auctions
                </Link>
            </div>

            {!configured && (
                <p className="mt-6 text-[11px] uppercase tracking-widest text-white/30">
                    Supabase connection not yet configured for this preview
                </p>
            )}
        </div>
    );
}
