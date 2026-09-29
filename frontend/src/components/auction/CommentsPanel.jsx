import { useState } from "react";
import { MessageCircle, LogIn, Send } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
    useAuctionComments,
    useAuctionReactions,
} from "@/hooks/useAuctionRoom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usernameFor, timeAgo } from "@/components/auction/format";

/**
 * Reaction types — data model unchanged; presentation moved from a separate
 * card into the Chat panel per targeted-fix spec. Backend behavior (Supabase
 * `reactions` table + RLS + realtime channel) is untouched.
 */
const REACTIONS = [
    { type: "fire",   label: "Fire",     emoji: "\uD83D\uDD25" },
    { type: "eyes",   label: "Watching", emoji: "\uD83D\uDC40" },
    { type: "heart",  label: "Love",     emoji: "\u2764\uFE0F" },
    { type: "gem",    label: "Gem",      emoji: "\uD83D\uDC8E" },
    { type: "rocket", label: "Bullish",  emoji: "\uD83D\uDE80" },
];

export function CommentsPanel({ auctionId }) {
    const { data, isLoading } = useAuctionComments(auctionId);
    const [tab, setTab] = useState("chat");

    return (
        <section data-testid="auction-comments-panel" className="bz-card p-5 md:p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h3 className="font-display text-lg font-semibold">Chat</h3>
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                        Live chat · real posts only
                    </p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.06] p-1">
                    <TabBtn active={tab === "chat"} onClick={() => setTab("chat")} testId="tab-chat">
                        Chat
                    </TabBtn>
                    <TabBtn
                        active={tab === "top"}
                        onClick={() => setTab("top")}
                        testId="tab-top-bidder"
                    >
                        Top Bidder
                    </TabBtn>
                </div>
            </header>

            {tab === "chat" ? (
                <ChatTab isLoading={isLoading} comments={data ?? []} />
            ) : (
                <TopBidderTab />
            )}

            <CommentComposer auctionId={auctionId} />
            <ReactionRow auctionId={auctionId} />
        </section>
    );
}

function TabBtn({ children, active, onClick, testId }) {
    return (
        <button
            type="button"
            data-testid={testId}
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={
                "rounded-full px-3 py-1 text-[11px] font-medium transition " +
                (active
                    ? "bg-[hsl(var(--bz-purple)/0.18)] text-[hsl(var(--bz-purple))]"
                    : "text-white/50 hover:text-white")
            }
        >
            {children}
        </button>
    );
}

function ChatTab({ isLoading, comments }) {
    const { user } = useAuth();
    if (isLoading) {
        return (
            <ul className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i} className="animate-pulse rounded-xl bg-white/[0.03] p-3">
                        <div className="h-2 w-24 rounded-full bg-white/[0.06]" />
                        <div className="mt-2 h-3 w-4/5 rounded-full bg-white/[0.06]" />
                    </li>
                ))}
            </ul>
        );
    }
    if (comments.length === 0) {
        return (
            <div
                data-testid="auction-comments-empty"
                className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center"
            >
                <MessageCircle className="mx-auto h-5 w-5 text-white/40" />
                <p className="mt-2 text-sm font-medium">Quiet in here.</p>
                <p className="mt-1 text-[11px] text-white/40">
                    Be the first to comment.
                </p>
            </div>
        );
    }
    return (
        <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
            {comments.map((c) => {
                const authorLabel = usernameFor(c.user, user);
                return (
                    <li
                        key={c.id}
                        data-testid={`comment-${c.id}`}
                        className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
                    >
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--bz-surface-2))] border border-white/10">
                                {c.user?.avatar_url ? (
                                    <img
                                        src={c.user.avatar_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-white/60">
                                        {authorLabel.slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <span
                                data-testid={`comment-author-${c.id}`}
                                className="text-xs font-medium text-white/85 truncate max-w-[140px] sm:max-w-none"
                            >
                                {authorLabel}
                            </span>
                            <span className="ml-auto text-[10px] text-white/40 shrink-0">
                                {timeAgo(c.created_at)}
                            </span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm text-white/80 break-words">
                            {c.message}
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}

function TopBidderTab() {
    return (
        <div
            data-testid="auction-top-bidder"
            className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center"
        >
            <p className="text-sm font-medium">Top Bidder view</p>
            <p className="mt-1 text-[11px] text-white/40">
                The winning bidder is highlighted in the bid history on the left.
            </p>
        </div>
    );
}

function CommentComposer({ auctionId }) {
    const { isAuthed, user, openAuthModal } = useAuth();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!isAuthed || !user) {
        return (
            <form
                data-testid="auction-comment-form"
                className="mt-4 flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 py-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    openAuthModal({ returnTo: location.pathname });
                }}
            >
                <input
                    type="text"
                    disabled
                    placeholder="Sign in to join the chat..."
                    aria-label="Comment"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none disabled:cursor-not-allowed min-w-0"
                />
                <button
                    type="submit"
                    data-testid="auction-comment-submit"
                    aria-label="Sign in to comment"
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bz-btn-secondary px-3 py-1.5 text-[11px] font-semibold"
                >
                    <LogIn className="h-3 w-3" /> Sign in
                </button>
            </form>
        );
    }

    async function submitComment(e) {
        e.preventDefault();
        const text = message.trim();
        if (!text || !supabase || submitting) return;
        setSubmitting(true);
        try {
            const { error } = await supabase.from("comments").insert({
                auction_id: auctionId,
                user_id: user.id,
                message: text,
            });
            if (error) throw error;
            setMessage("");
            await queryClient.invalidateQueries({
                queryKey: ["auction-comments", auctionId],
            });
            toast.success("Comment posted");
        } catch {
            toast.error("Could not post your comment", {
                description: "Please try again in a moment.",
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form
            data-testid="auction-comment-form"
            className="mt-4 flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 py-2 focus-within:border-[hsl(var(--bz-purple)/0.6)] transition"
            onSubmit={submitComment}
        >
            <input
                type="text"
                data-testid="auction-comment-input"
                value={message}
                maxLength={1000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a comment..."
                aria-label="Comment"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none min-w-0"
            />
            <button
                type="submit"
                data-testid="auction-comment-submit"
                aria-label="Send comment"
                disabled={submitting || message.trim().length === 0}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bz-btn-secondary px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
            >
                <Send className="h-3 w-3" /> Send
            </button>
        </form>
    );
}

/**
 * Reactions row rendered UNDERNEATH the chat input, replacing the previous
 * standalone Reactions card. Same Supabase reactions table, same RLS, same
 * realtime channel \u2014 only presentation moved.
 */
function ReactionRow({ auctionId }) {
    const { data } = useAuctionReactions(auctionId);
    const { isAuthed, user, openAuthModal } = useAuth();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(null);
    const counts = data?.byType ?? {};
    const mine = new Set(
        user
            ? (data?.rows ?? []).filter((r) => r.user_id === user.id).map((r) => r.reaction_type)
            : []
    );

    async function toggleReaction(type) {
        if (!isAuthed || !user) {
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
        } catch {
            toast.error("Could not save your reaction", {
                description: "Please try again in a moment.",
            });
        } finally {
            setPending(null);
        }
    }

    return (
        <ul
            data-testid="auction-reactions-bar"
            className="mt-3 flex flex-wrap gap-1.5"
        >
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
                                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition " +
                                (active
                                    ? "border-[hsl(var(--bz-purple)/0.7)] bg-[hsl(var(--bz-purple)/0.16)] shadow-[0_0_20px_hsl(var(--bz-purple)/0.25)]"
                                    : "border-white/[0.08] bg-white/[0.02] hover:border-[hsl(var(--bz-purple)/0.5)] hover:bg-white/[0.04]") +
                                (pending === r.type ? " opacity-60 cursor-wait" : "")
                            }
                        >
                            <span className="text-base leading-none">{r.emoji}</span>
                            <span className="hidden text-[11px] text-white/70 sm:inline">{r.label}</span>
                            <span className="ml-0.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/80">
                                {counts[r.type] ?? 0}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
