import { useEffect, useMemo, useState } from "react";
import { Bell, Check, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const TYPE_META = {
    AUCTION_WON: { label: "Auction won", tone: "text-[hsl(var(--bz-purple))]" },
    OUTBID: { label: "You were outbid", tone: "text-amber-200" },
    ITEM_DELIVERED: { label: "Item delivered", tone: "text-[hsl(var(--bz-green))]" },
    DISPUTE_RESOLVED: { label: "Dispute resolved", tone: "text-sky-200" },
    SETTLEMENT_COMPLETED: { label: "Settlement completed", tone: "text-[hsl(var(--bz-green))]" },
    ITEM_SHIPPED: { label: "Item shipped", tone: "text-sky-200" },
    PAYMENT_RECEIVED: { label: "Payment received", tone: "text-[hsl(var(--bz-purple))]" },
    PAYMENT_CONFIRMED: { label: "Payment secured", tone: "text-[hsl(var(--bz-purple))]" },
    AUCTION_SOLD: { label: "Auction sold", tone: "text-[hsl(var(--bz-purple))]" },
    NO_SALE: { label: "Auction ended", tone: "text-white/70" },
};

function relativeTime(value) {
    const delta = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function NotificationCenter() {
    const { user, isAuthed, openAuthModal } = useAuth();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);

    const query = useQuery({
        queryKey: ["notifications", user?.id],
        enabled: Boolean(supabase && isAuthed && user?.id),
        staleTime: 15_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("notifications")
                .select("id,type,auction_id,bid_id,message,is_read,created_at,auction:auctions(id,title)")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(30);
            if (error) throw error;
            return data || [];
        },
    });

    useEffect(() => {
        if (!supabase || !isAuthed || !user?.id) return undefined;
        const channel = supabase
            .channel(`notifications:${user.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
                () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [isAuthed, qc, user?.id]);

    const notifications = query.data || [];
    const unread = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

    async function markRead(id) {
        if (!supabase || !user?.id) return;
        const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", user.id);
        if (error) {
            toast.error("Could not update notification", { description: error.message });
            return;
        }
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    }

    async function markAllRead() {
        if (!supabase || !user?.id || unread === 0) return;
        const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
        if (error) {
            toast.error("Could not mark notifications as read", { description: error.message });
            return;
        }
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    }

    async function openNotification(item) {
        if (!item.is_read) await markRead(item.id);
        setOpen(false);
        if (item.auction_id) navigate(`/auction/${item.auction_id}`);
        else navigate("/profile");
    }

    function handleButton() {
        if (!isAuthed) {
            openAuthModal({ returnTo: "/profile" });
            return;
        }
        setOpen((value) => !value);
    }

    return (
        <div className="relative">
            <button
                type="button"
                data-testid="header-notifications"
                aria-label={unread ? `${unread} unread notifications` : "Notifications"}
                aria-expanded={open}
                onClick={handleButton}
                title={isAuthed ? "Open notifications" : "Sign in to view notifications"}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-[hsl(var(--bz-surface))]/60 text-white/70 transition hover:border-[hsl(var(--bz-purple)/0.45)] hover:text-white"
            >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                    <span data-testid="notification-unread-count" className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full border border-[hsl(var(--bz-bg))] bg-[hsl(var(--bz-purple))] px-1 text-[9px] font-bold leading-4 text-white">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div data-testid="notification-center" className="absolute right-0 top-12 z-[80] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[0.1] bg-[hsl(var(--bz-surface))] shadow-2xl shadow-black/50">
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-white">Notifications</p>
                            <p className="text-[10px] uppercase tracking-widest text-white/40">Live account updates</p>
                        </div>
                        <button type="button" data-testid="notifications-mark-all" onClick={markAllRead} disabled={!unread} className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/55 transition hover:text-white disabled:opacity-35">
                            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                        </button>
                    </div>
                    {query.isLoading ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Reading updates…</div>
                    ) : query.isError ? (
                        <div className="px-4 py-8 text-center text-xs text-white/50">Notifications are temporarily unavailable.</div>
                    ) : notifications.length === 0 ? (
                        <div data-testid="notifications-empty" className="px-4 py-10 text-center text-xs text-white/50">You are all caught up.</div>
                    ) : (
                        <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
                            {notifications.map((item) => {
                                const meta = TYPE_META[item.type] || { label: item.type?.replaceAll("_", " ") || "Update", tone: "text-white/70" };
                                return (
                                    <li key={item.id}>
                                        <button type="button" data-testid={`notification-${item.id}`} onClick={() => openNotification(item)} className={`flex w-full items-start gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition hover:bg-white/[0.04] ${item.is_read ? "opacity-60" : "bg-[hsl(var(--bz-purple)/0.06)]"}`}>
                                            <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 ${meta.tone}`}>
                                                {item.is_read ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className={`block text-[10px] font-bold uppercase tracking-widest ${meta.tone}`}>{meta.label}</span>
                                                <span className="mt-0.5 block text-xs leading-relaxed text-white/80">{item.message}</span>
                                                {item.auction?.title && <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-white/40">{item.auction.title} <ExternalLink className="h-2.5 w-2.5 shrink-0" /></span>}
                                                <span className="mt-1 block text-[10px] text-white/35">{relativeTime(item.created_at)}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
