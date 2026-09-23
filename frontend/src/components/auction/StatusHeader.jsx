import { ShieldCheck, Radio, Package, Sparkles, Clock } from "lucide-react";
import { CountdownTimer } from "@/components/home/CountdownTimer";
import { displayName } from "@/components/auction/format";

const STATUS_STYLES = {
    LIVE: {
        pill: "border-[hsl(var(--bz-red)/0.55)] text-white",
        label: (
            <>
                <span className="bz-live-dot" /> Live
            </>
        ),
    },
    SCHEDULED: {
        pill: "border-white/15 text-white/80",
        label: (
            <>
                <Clock className="h-3 w-3" /> Scheduled
            </>
        ),
    },
    ENDED: {
        pill: "border-white/15 text-white/70",
        label: <>Ended</>,
    },
    CANCELLED: {
        pill: "border-white/15 text-white/50",
        label: <>Cancelled</>,
    },
    DRAFT: {
        pill: "border-white/15 text-white/60",
        label: <>Draft</>,
    },
};

export function StatusHeader({ auction }) {
    if (!auction) return null;
    const seller = auction.seller || {};
    const isVerified = (seller.reputation_score ?? 0) >= 50;
    const status = STATUS_STYLES[auction.status] || STATUS_STYLES.LIVE;

    return (
        <section
            data-testid="auction-status-header"
            className="relative border-b border-white/[0.06]"
        >
            <div className="mx-auto max-w-[1400px] px-4 md:px-8 py-6 md:py-8">
                {/* Row 1: badges + timer */}
                <div className="flex flex-wrap items-center gap-3">
                    <span
                        data-testid="auction-status-pill"
                        className={`inline-flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${status.pill}`}
                    >
                        {status.label}
                    </span>
                    {auction.category && (
                        <span className="rounded-full bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/70">
                            {auction.category}
                        </span>
                    )}
                    {auction.auction_type && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--bz-purple)/0.14)] border border-[hsl(var(--bz-purple)/0.35)] px-2.5 py-1 text-[10px] uppercase tracking-widest text-[hsl(var(--bz-purple))]">
                            {auction.auction_type === "PHYSICAL" ? (
                                <Package className="h-3 w-3" />
                            ) : (
                                <Sparkles className="h-3 w-3" />
                            )}
                            {auction.auction_type}
                        </span>
                    )}
                    {auction.condition && (
                        <span className="rounded-full bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/60">
                            {auction.condition}
                        </span>
                    )}

                    <div className="ml-auto inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/70 px-2.5 py-1.5 backdrop-blur sm:px-3">
                        <Radio className="hidden h-3.5 w-3.5 text-[hsl(var(--bz-purple))] sm:block" />
                        <CountdownTimer
                            endTime={auction.end_time}
                            antiSnipingSeconds={auction.anti_sniping_seconds || 10}
                            testId="auction-hero-timer"
                        />
                    </div>
                </div>

                {/* Row 2: title + seller */}
                <h1
                    data-testid="auction-title"
                    className="mt-5 font-display text-3xl font-bold leading-tight md:text-4xl lg:text-5xl"
                >
                    {auction.title || "Untitled auction"}
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--bz-surface-2))] border border-white/10">
                            {seller.avatar_url ? (
                                <img
                                    src={seller.avatar_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-xs text-white/60">
                                    {(displayName(seller) || "?").slice(0, 1).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="leading-tight">
                            <div className="text-[10px] uppercase tracking-widest text-white/40">
                                Seller
                            </div>
                            <div
                                data-testid="auction-seller-name"
                                className="text-sm font-medium text-white"
                            >
                                {displayName(seller)}
                            </div>
                        </div>
                    </div>

                    {isVerified && (
                        <span
                            data-testid="auction-seller-verified"
                            className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--bz-purple)/0.14)] border border-[hsl(var(--bz-purple)/0.35)] px-2 py-0.5 text-[11px] text-[hsl(var(--bz-purple))]"
                        >
                            <ShieldCheck className="h-3.5 w-3.5" /> Verified
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
}
