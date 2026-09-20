import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { Eye } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuctionReactions } from "@/hooks/useAuctionRoom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * Fire, watch/eyes, heart, diamond, rocket reactions — wired to the existing
 * `reactions` table + RLS (select public / insert own / delete own) and the
 * existing realtime subscription (counts refresh on any change).
 *
 * - Authenticated: click toggles the user's reaction (unique per
 *   auction+user+type), with visual active state. Persists via Supabase.
 * - Unauthenticated: click opens the existing Google sign-in modal — never a
 *   silent failure, never an anonymous reaction row.
 *
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
    const { isAuthed, user, openAuthModal } = useAuth();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(null);
    const counts = data?.byType ?? {};

    // The user's own reactions, derived from the same trusted server rows.
    const mine = new Set(
        user ? (data?.rows ?? []).filter((r) => r.user_id === user.id).map((r) => r.reaction_type) : []
    );

    async function toggleReaction(type) {
        if (!isAuthed || !user) {
            // Clear, honest sign-in prompt via the existing auth modal.
            openAuthModal({ returnTo: location.pathname });
            return;
        }
        if (!supabase || pending) return;
        setPending(type);
        try {
            if (mine.has(type)) {
                const { error } = await supabase
                    .from("reactions")
                    .delete()
                    .eq("auction_id", auctionId)
                    .eq("user_id", user.id)
                    .eq("reaction_type", type);
                if (error) throw error;
            } else {
                const { error } = await supabase.from("reactions").insert({
                    auction_id: auctionId,
                    user_id: user.id,
                    reaction_type: type,
                });
                if (error) throw error;
            }
            await queryClient.invalidateQueries({
                queryKey: ["auction-reactions", auctionId],
            });
        } catch (e) {
            toast.error("Could not save your reaction", {
                description: "Please try again in a moment.",
            });
        } finally {
            setPending(null);
        }
    }

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
                {REACTIONS.map((r) => {
                    const active = mine.has(r.type);
                    return (
                        <li key={r.type}>
                            <button
                                type="button"
                                data-testid={`reaction-${r.type}`}
                                data-active={active ? "true" : "false"}
                                aria-pressed={active}
                                aria-label={active ? `Remove ${r.label} reaction` : `React ${r.label}`}
                                disabled={pending === r.type}
                                onClick={() => toggleReaction(r.type)}
                                className={
                                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition " +
                                    (active
                                        ? "border-[hsl(var(--bz-purple)/0.7)] bg-[hsl(var(--bz-purple)/0.16)] shadow-[0_0_20px_hsl(var(--bz-purple)/0.25)]"
                                        : "border-white/[0.08] bg-white/[0.02] hover:border-[hsl(var(--bz-purple)/0.5)] hover:bg-white/[0.04]") +
                                    (pending === r.type ? " opacity-60 cursor-wait" : "")
                                }
                            >
                                <span className="text-base leading-none">{r.emoji}</span>
                                <span className="text-xs text-white/70">{r.label}</span>
                                <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/80">
                                    {counts[r.type] ?? 0}
                                </span>
                            </button>
                        </li>
                    );
                })}
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
