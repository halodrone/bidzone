import { Gavel, Crown } from "lucide-react";
import { useAuctionBids } from "@/hooks/useAuctionRoom";
import { fmtAmount, shortAddr, timeAgo } from "@/components/auction/format";

export function BidHistory({ auctionId }) {
    const { data, isLoading, isError } = useAuctionBids(auctionId);
    const rows = data?.rows ?? [];
    const count = data?.count ?? 0;

    return (
        <section
            data-testid="auction-bid-history"
            className="bz-card p-5 md:p-6"
        >
            <header className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-display text-lg font-semibold">Bid History</h3>
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                        {count > 0 ? `${count} total bid${count === 1 ? "" : "s"}` : "Newest first"}
                    </p>
                </div>
            </header>

            {isLoading ? (
                <BidRowSkeleton />
            ) : isError || rows.length === 0 ? (
                <EmptyBids />
            ) : (
                <ul className="mt-4 divide-y divide-white/[0.06]">
                    {rows.map((b, idx) => (
                        <BidRow key={b.id} bid={b} isTop={idx === 0 && b.status === "WINNING"} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function BidRow({ bid, isTop }) {
    return (
        <li
            data-testid={`bid-row-${bid.id}`}
            className={
                "flex items-center gap-3 py-3 first:pt-0 " +
                (isTop ? "text-white" : "text-white/85")
            }
        >
            <span
                className={
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg border " +
                    (isTop
                        ? "border-[hsl(var(--bz-purple)/0.6)] bg-[hsl(var(--bz-purple)/0.14)] text-[hsl(var(--bz-purple))]"
                        : "border-white/10 bg-white/[0.03] text-white/60")
                }
            >
                {isTop ? <Crown className="h-4 w-4" /> : <Gavel className="h-4 w-4" />}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{shortAddr(bid.wallet_address)}</span>
                    {isTop && (
                        <span className="rounded-full bg-[hsl(var(--bz-purple)/0.18)] border border-[hsl(var(--bz-purple)/0.35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--bz-purple))]">
                            Winning
                        </span>
                    )}
                    {bid.status === "OUTBID" && (
                        <span className="rounded-full bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-white/40">
                            Outbid
                        </span>
                    )}
                </div>
                <div className="text-[11px] text-white/40">{timeAgo(bid.created_at)}</div>
            </div>
            <div className="font-display text-base font-semibold tabular-nums">
                {fmtAmount(bid.amount)}
                <span className="ml-1 text-[10px] font-medium text-white/45 tracking-widest">
                    MON
                </span>
            </div>
        </li>
    );
}

function BidRowSkeleton() {
    return (
        <ul className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-8 w-8 rounded-lg bg-white/[0.06]" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 w-32 rounded-full bg-white/[0.06]" />
                        <div className="h-2 w-16 rounded-full bg-white/[0.06]" />
                    </div>
                    <div className="h-4 w-20 rounded-full bg-white/[0.06]" />
                </li>
            ))}
        </ul>
    );
}

function EmptyBids() {
    return (
        <div
            data-testid="auction-bid-history-empty"
            className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center"
        >
            <Gavel className="mx-auto h-5 w-5 text-white/40" />
            <p className="mt-2 text-sm font-medium">No bids yet.</p>
            <p className="mt-1 text-[11px] text-white/40">
                Be the first to place a bid.
            </p>
        </div>
    );
}
