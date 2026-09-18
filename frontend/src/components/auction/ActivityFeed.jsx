import { useMemo } from "react";
import { Gavel, MessageCircle, Heart, Radio, TimerReset } from "lucide-react";
import {
    useAuctionBids,
    useAuctionComments,
    useAuctionReactions,
} from "@/hooks/useAuctionRoom";
import { fmtAmount, shortAddr, displayName, timeAgo } from "@/components/auction/format";

/**
 * Real-time activity feed built from actual bids + comments + reactions.
 * No fabricated events. Sorted by created_at desc, capped to 30 items.
 */
export function ActivityFeed({ auctionId, auctionStatus }) {
    const { data: bids }      = useAuctionBids(auctionId, { limit: 20 });
    const { data: comments }  = useAuctionComments(auctionId, { limit: 20 });
    const { data: reactions } = useAuctionReactions(auctionId);

    const events = useMemo(() => {
        const out = [];
        (bids?.rows ?? []).forEach((b) =>
            out.push({
                id: `b-${b.id}`,
                type: b.status === "WINNING" ? "BID_WINNING" : "BID",
                at: b.created_at,
                title: `${shortAddr(b.wallet_address)} placed a bid`,
                detail: `${fmtAmount(b.amount)} MON`,
            })
        );
        (comments ?? []).forEach((c) =>
            out.push({
                id: `c-${c.id}`,
                type: "COMMENT",
                at: c.created_at,
                title: `${displayName(c.user)} commented`,
                detail: c.message?.slice(0, 90),
            })
        );
        (reactions?.rows ?? []).forEach((r) =>
            out.push({
                id: `r-${r.user_id}-${r.reaction_type}-${r.created_at}`,
                type: "REACTION",
                at: r.created_at,
                title: `A reaction was added`,
                detail: r.reaction_type,
            })
        );
        if (auctionStatus === "ENDED") {
            out.push({
                id: "sys-ended",
                type: "SYSTEM",
                at: new Date().toISOString(),
                title: "Auction ended",
                detail: "Awaiting settlement",
            });
        }
        return out
            .sort((a, b) => new Date(b.at) - new Date(a.at))
            .slice(0, 30);
    }, [bids, comments, reactions, auctionStatus]);

    return (
        <section data-testid="auction-activity-feed" className="bz-card p-5 md:p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h3 className="font-display text-lg font-semibold">Live Activity</h3>
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                        Real events only
                    </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/60">
                    <span className="bz-live-dot" />
                    Live
                </span>
            </header>

            {events.length === 0 ? (
                <div
                    data-testid="auction-activity-empty"
                    className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center"
                >
                    <Radio className="mx-auto h-5 w-5 text-white/40" />
                    <p className="mt-2 text-sm font-medium">No activity yet.</p>
                    <p className="mt-1 text-[11px] text-white/40">
                        Be the first to interact.
                    </p>
                </div>
            ) : (
                <ul className="mt-4 space-y-3">
                    {events.map((e) => (
                        <ActivityRow key={e.id} event={e} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function ActivityRow({ event }) {
    const map = {
        BID:         { Icon: Gavel,        color: "text-white/70" },
        BID_WINNING: { Icon: Gavel,        color: "text-[hsl(var(--bz-purple))]" },
        COMMENT:     { Icon: MessageCircle,color: "text-white/70" },
        REACTION:    { Icon: Heart,        color: "text-[hsl(var(--bz-red))]" },
        SYSTEM:      { Icon: TimerReset,   color: "text-white/60" },
    };
    const { Icon, color } = map[event.type] || map.SYSTEM;
    return (
        <li className="flex items-start gap-3">
            <span
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] ${color}`}
            >
                <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-white/90">{event.title}</span>
                    {event.detail ? (
                        <span className="text-xs text-white/60 truncate">{event.detail}</span>
                    ) : null}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/35">
                    {timeAgo(event.at)}
                </div>
            </div>
        </li>
    );
}
