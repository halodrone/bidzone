import { Link } from "react-router-dom";
import { Radio, TrendingUp, Timer, LayoutGrid, AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveAuctions } from "@/hooks/useLiveAuctions";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AuctionCard, AuctionCardSkeleton } from "@/components/home/AuctionCard";
import { EmptyState } from "@/components/home/EmptyState";
import { CATEGORIES } from "@/components/home/CategorySection";

const TABS = [
    { key: "live",         label: "Live",         icon: Radio },
    { key: "ending-soon",  label: "Ending Soon",  icon: Timer },
    { key: "trending",     label: "Trending",     icon: TrendingUp },
    { key: "all",          label: "All",          icon: LayoutGrid },
];

const VALID_TABS = new Set(TABS.map((t) => t.key));

export function LiveAuctionsSection() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab");
    const category = searchParams.get("category") || "";
    const search = searchParams.get("search") || "";
    const [filter, setFilter] = useState(() =>
        VALID_TABS.has(tabParam) ? tabParam : "live"
    );

    // Functional navigation: when the user arrives via a nav link (?tab=...),
    // sync the section's tab with the requested one. Runs on mount + whenever
    // the requested tab changes; local tab clicks stay untouched afterwards.
    useEffect(() => {
        if (VALID_TABS.has(tabParam)) setFilter(tabParam);
    }, [tabParam]);

    const { data, isLoading, isError } = useLiveAuctions(filter, 12, category, search);
    const auctions = data ?? [];
    const categoryLabel = CATEGORIES.find((c) => c.slug === category)?.label;

    function clearCategory() {
        const next = new URLSearchParams(searchParams);
        next.delete("category");
        setSearchParams(next);
    }

    return (
        <section
            data-testid="home-live-auctions"
            id="live-auctions"
            className="mx-auto max-w-[1400px] scroll-mt-32 px-4 md:scroll-mt-24 md:px-8 py-8 md:py-16"
        >
            <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="bz-live-dot" />
                        <h2 className="font-display text-3xl font-bold md:text-4xl">
                            Live Auctions
                        </h2>
                    </div>
                    <p className="mt-2 text-sm text-white/50 md:text-base">
                        Real-time bidding. Live activity. Don't miss out.
                    </p>
                </div>
                {category && (
                    <button
                        type="button"
                        data-testid="live-auctions-category-chip"
                        onClick={clearCategory}
                        title="Clear category filter"
                        className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[hsl(var(--bz-purple)/0.55)] bg-[hsl(var(--bz-purple)/0.14)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--bz-purple)/0.22)]"
                    >
                        <span className="text-white/60">Category:</span>
                        {categoryLabel || category}
                        <X className="h-3.5 w-3.5 text-white/70" />
                    </button>
                )}
            </header>

            {/* Tabs */}
            <div
                role="tablist"
                data-testid="live-auctions-tabs"
                className="mt-6 bz-scroll-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
            >
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = filter === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            data-testid={`tab-${key}`}
                            onClick={() => setFilter(key)}
                            className={
                                "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition " +
                                (active
                                    ? "border-[hsl(var(--bz-purple)/0.55)] bg-[hsl(var(--bz-purple)/0.14)] text-white shadow-[0_0_24px_hsl(var(--bz-purple)/0.28)]"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:border-white/20")
                            }
                        >
                            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Body */}
            <div className="mt-8">
                {isLoading ? (
                    <SkeletonGrid />
                ) : isError ? (
                    <ErrorState />
                ) : auctions.length === 0 ? (
                    search ? (
                        <div data-testid="search-empty" className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
                            <h3 className="font-display text-lg font-semibold">No results found.</h3>
                            <p className="mt-2 text-sm text-white/50">Try a different keyword.</p>
                        </div>
                    ) : (
                        <EmptyState variant={filter} configured={isSupabaseConfigured} />
                    )
                ) : (
                    <ul
                        data-testid="live-auctions-grid"
                        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    >
                        {auctions.map((a) => (
                            <li key={a.id}>
                                <AuctionCard auction={a} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function SkeletonGrid() {
    return (
        <ul
            data-testid="live-auctions-skeleton"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
            {Array.from({ length: 4 }).map((_, i) => (
                <li key={i}>
                    <AuctionCardSkeleton />
                </li>
            ))}
        </ul>
    );
}

function ErrorState() {
    return (
        <div
            data-testid="live-auctions-error"
            className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center"
        >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--bz-red)/0.15)] border border-[hsl(var(--bz-red)/0.35)]">
                <AlertTriangle className="h-5 w-5 text-[hsl(var(--bz-red))]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">
                We couldn't load live auctions.
            </h3>
            <p className="mt-2 text-sm text-white/50">
                Please refresh in a moment.
            </p>
            <Link
                to="/"
                className="mt-6 inline-flex items-center justify-center rounded-full bz-btn-secondary px-4 py-2 text-sm font-medium"
            >
                Reload
            </Link>
        </div>
    );
}
