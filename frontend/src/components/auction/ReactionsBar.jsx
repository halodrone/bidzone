import { toast } from "sonner";
import { Eye } from "lucide-react";
import { useAuctionReactions } from "@/hooks/useAuctionRoom";

/**
 * Fire, watch/eyes, heart, and diamond reactions. All disabled until auth
 * is wired — a click routes to a sign-in toast rather than fabricating a row.
 * Real counts come from the reactions table via useAuctionReactions.
 * Watcher count is intentionally NOT shown as a number because RLS keeps the
 * watchlist table private (Phase 4.1) and we do not fabricate it.
 */
const REACTIONS = [
    { type: "fire",    label: "Fire",    emoji: "🔥" },
    { type: "eyes",    label: "Watching",emoji: "👀" },
    { type: "heart",   label: "Love",    emoji: "❤️" },
    { type: "gem",     label: "Gem",     emoji: "💎" },
    { type: "rocket",  label: "Bullish", emoji: "🚀" },
];

export function ReactionsBar({ auctionId }) {
    const { data } = useAuctionReactions(auctionId);
    const counts = data?.byType ?? {};

    return (
        <section
            data-testid="auction-reactions-bar"
            className="bz-card flex flex-col gap-4 p-5 md:p-6"
        >
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-display text-lg font-semibold">Reactions</h3>
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                        Real counts only
                    </p>
                </div>
                <WatcherBadge />
            </div>
            <ul className="flex flex-wrap gap-2">
                {REACTIONS.map((r) => (
                    <li key={r.type}>
                        <button
                            type="button"
                            data-testid={`reaction-${r.type}`}
                            aria-label={`React ${r.label}`}
                            onClick={() =>
                                toast("Sign in to react", {
                                    description:
                                        "We won't record a reaction until you're signed in.",
                                })
                            }
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-sm transition hover:border-[hsl(var(--bz-purple)/0.5)] hover:bg-white/[0.04]"
                        >
                            <span className="text-base leading-none">{r.emoji}</span>
                            <span className="text-xs text-white/70">{r.label}</span>
                            <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/80">
                                {counts[r.type] ?? 0}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function WatcherBadge() {
    // We deliberately do not display a fabricated watcher number because the
    // watchlist table is private per RLS. Users see a neutral "Watching" chip
    // instead of a suspicious count.
    return (
        <span
            data-testid="auction-watcher-badge"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] px-2.5 py-1 text-[11px] text-white/60"
            title="Watcher counts will appear once the aggregate service is available"
        >
            <Eye className="h-3.5 w-3.5" />
            Watching
        </span>
    );
}
