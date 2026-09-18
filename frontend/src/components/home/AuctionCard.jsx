import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, MessageCircle, Heart, ShieldCheck, ImageOff } from "lucide-react";
import { CountdownTimer } from "@/components/home/CountdownTimer";

/**
 * Format a Numeric(38,18) string as a compact display value.
 * MON precision is preserved as string; we only trim trailing zeros for display.
 */
function fmtAmount(n) {
    if (n === null || n === undefined || n === "") return "—";
    const s = String(n);
    if (!s.includes(".")) return `${s}`;
    return s.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * First IMAGE (by sort_order) of the auction. The data hook already resolved
 * storage paths to signed URLs (Phase 6.1); videos are never used on Home so
 * large media is never downloaded by the grid.
 */
function coverImage(auction) {
    const images = (auction.auction_items || []).filter(
        (i) => i && i.media_type === "IMAGE" && i.media_url
    );
    if (!images.length) return null;
    const sorted = [...images].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    return sorted[0].media_url;
}

export function AuctionCard({ auction }) {
    const img = coverImage(auction);
    const [imgOk, setImgOk] = useState(Boolean(img));
    useEffect(() => setImgOk(Boolean(img)), [img]);
    const seller = auction.seller || {};
    const price = auction.current_bid ?? auction.starting_bid;
    const isVerified = (seller.reputation_score ?? 0) >= 50;

    return (
        <article
            data-testid={`auction-card-${auction.id}`}
            className="bz-card group flex h-full flex-col overflow-hidden"
        >
            {/* Cover */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[hsl(var(--bz-surface-2))]">
                {img && imgOk ? (
                    <img
                        src={img}
                        alt={auction.title}
                        loading="lazy"
                        onError={() => setImgOk(false)}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
                        <ImageOff className="h-6 w-6" />
                        <span className="text-[11px] uppercase tracking-widest">No image</span>
                    </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* LIVE badge + timer */}
                <div className="absolute left-3 top-3 flex items-center gap-2">
                    {auction.status === "LIVE" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-[hsl(var(--bz-red)/0.55)] backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                            <span className="bz-live-dot" />
                            Live
                        </span>
                    )}
                    {auction.status === "SCHEDULED" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-white/15 backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/80">
                            Scheduled
                        </span>
                    )}
                </div>
                <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur border border-white/10 px-2.5 py-1">
                    <CountdownTimer
                        endTime={auction.end_time}
                        testId={`auction-timer-${auction.id}`}
                    />
                </div>

                {/* Category / type chip */}
                <div className="absolute left-3 bottom-3 flex flex-wrap gap-1.5">
                    {auction.category && (
                        <span className="rounded-full bg-black/60 backdrop-blur border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/85">
                            {auction.category}
                        </span>
                    )}
                    {auction.auction_type && (
                        <span className="rounded-full bg-[hsl(var(--bz-purple)/0.18)] border border-[hsl(var(--bz-purple)/0.4)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[hsl(var(--bz-purple))]">
                            {auction.auction_type}
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col gap-3 p-4">
                <h3
                    className="font-display text-base font-semibold leading-tight line-clamp-2"
                    title={auction.title}
                >
                    {auction.title || "Untitled auction"}
                </h3>

                {/* Seller row */}
                <div className="flex items-center gap-2">
                    <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--bz-surface-2))] border border-white/10">
                        {seller.avatar_url ? (
                            <img
                                src={seller.avatar_url}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-[10px] text-white/60">
                                {(seller.display_name || seller.username || "?").slice(0, 1).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <span className="text-xs text-white/60 truncate">
                        {seller.display_name || seller.username || "Anonymous seller"}
                    </span>
                    {isVerified && (
                        <span
                            title="Verified seller"
                            className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--bz-purple)/0.14)] border border-[hsl(var(--bz-purple)/0.35)] px-1.5 py-0.5 text-[10px] text-[hsl(var(--bz-purple))]"
                        >
                            <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                    )}
                    {auction.condition && (
                        <span className="ml-auto rounded-full bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/50">
                            {auction.condition}
                        </span>
                    )}
                </div>

                {/* Price + activity */}
                <div className="mt-1 flex items-end justify-between gap-2">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-white/40">
                            {auction.current_bid ? "Current bid" : "Starting bid"}
                        </div>
                        <div className="font-display text-xl font-bold tabular-nums">
                            {fmtAmount(price)}
                            <span className="ml-1.5 text-[11px] font-medium text-white/50 tracking-widest">
                                MON
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-white/40">
                        <StatChip icon={Eye} value="—" label="Watchers" />
                        <StatChip icon={Heart} value="—" label="Reactions" />
                        <StatChip icon={MessageCircle} value="—" label="Bids" />
                    </div>
                </div>

                <Link
                    to={`/auction/${auction.id}`}
                    data-testid={`view-auction-${auction.id}`}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bz-btn-primary px-4 py-2.5 text-sm font-semibold"
                >
                    View Auction
                </Link>
            </div>
        </article>
    );
}

function StatChip({ icon: Icon, value, label }) {
    return (
        <span
            title={label}
            className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5"
        >
            <Icon className="h-3 w-3" />
            <span className="tabular-nums">{value}</span>
        </span>
    );
}

export function AuctionCardSkeleton() {
    return (
        <div className="bz-card animate-pulse overflow-hidden">
            <div className="aspect-[4/3] w-full bg-white/[0.04]" />
            <div className="space-y-3 p-4">
                <div className="h-4 w-4/5 rounded-full bg-white/[0.06]" />
                <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-white/[0.06]" />
                    <div className="h-3 w-24 rounded-full bg-white/[0.06]" />
                </div>
                <div className="mt-1 flex items-end justify-between">
                    <div className="space-y-2">
                        <div className="h-2 w-16 rounded-full bg-white/[0.06]" />
                        <div className="h-5 w-24 rounded-full bg-white/[0.08]" />
                    </div>
                    <div className="h-4 w-16 rounded-full bg-white/[0.06]" />
                </div>
                <div className="h-10 w-full rounded-full bg-white/[0.06]" />
            </div>
        </div>
    );
}
