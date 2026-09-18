import { useState } from "react";
import { MessageCircle, LogIn, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuctionComments } from "@/hooks/useAuctionRoom";
import { displayName, timeAgo } from "@/components/auction/format";

export function CommentsPanel({ auctionId }) {
    const { data, isLoading } = useAuctionComments(auctionId);
    const [tab, setTab] = useState("chat");

    return (
        <section data-testid="auction-comments-panel" className="bz-card p-5 md:p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h3 className="font-display text-lg font-semibold">Discussion</h3>
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

            <CommentComposer />
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
            {comments.map((c) => (
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
                                    {(displayName(c.user) || "?").slice(0, 1).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <span className="text-xs font-medium text-white/85 truncate">
                            {displayName(c.user)}
                        </span>
                        <span className="ml-auto text-[10px] text-white/40">
                            {timeAgo(c.created_at)}
                        </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-white/80">
                        {c.message}
                    </p>
                </li>
            ))}
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

function CommentComposer() {
    return (
        <form
            data-testid="auction-comment-form"
            className="mt-4 flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 py-2"
            onSubmit={(e) => {
                e.preventDefault();
                toast("Sign in to join the discussion");
            }}
        >
            <input
                type="text"
                disabled
                placeholder="Sign in to join the discussion..."
                aria-label="Comment"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none disabled:cursor-not-allowed"
            />
            <button
                type="submit"
                data-testid="auction-comment-submit"
                aria-label="Sign in to send"
                className="inline-flex items-center gap-1 rounded-full bz-btn-secondary px-3 py-1.5 text-[11px] font-semibold"
            >
                <LogIn className="h-3 w-3" /> Sign in
                <Send className="h-3 w-3 opacity-60" />
            </button>
        </form>
    );
}
