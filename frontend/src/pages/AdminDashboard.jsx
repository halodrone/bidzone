import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle } from "lucide-react";
import { Header } from "@/components/home/Header";
import { Footer } from "@/components/home/Footer";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * BIDZONE — Admin Dashboard (silent).
 *
 * Auth model: reuses the EXISTING Google/Supabase auth. Access is gated by
 * profiles.is_admin = true (see migration 20260701000002). Non-admins are
 * redirected to "/" without ever seeing an error — the admin surface is
 * intentionally invisible to the rest of the userbase.
 *
 * Scope (intentionally minimal): review disputes still under moderation
 * (OPEN / UNDER_REVIEW) and resolve them via the existing resolve_dispute
 * RPC (RELEASE_SELLER / REFUND_BUYER / CANCEL_DISPUTE). No new mutation
 * logic — the DB is the source of truth.
 */
export default function AdminDashboard() {
    const navigate = useNavigate();
    const { isLoading, isAuthed, profile } = useAuth();
    const isAdmin = Boolean(profile?.is_admin);

    // Fail silently for non-admins. isLoading is awaited so a signed-in
    // admin never flashes the redirect during the initial profile fetch.
    useEffect(() => {
        if (isLoading) return;
        if (!isAuthed || (profile !== null && !isAdmin)) {
            navigate("/", { replace: true });
        }
    }, [isLoading, isAuthed, isAdmin, profile, navigate]);

    if (isLoading || !isAuthed || !isAdmin) {
        return (
            <div data-testid="page-admin-loading" className="bz-ambient min-h-screen">
                <Header />
                <main className="max-w-3xl mx-auto px-4 py-16 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--bz-purple))]" />
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div data-testid="page-admin" className="bz-ambient min-h-screen">
            <Header />
            <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
                <header className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--bz-purple))]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Admin
                    </div>
                    <h1 data-testid="admin-title" className="text-3xl font-semibold text-white">
                        Dispute Review
                    </h1>
                    <p className="text-sm text-white/55">
                        Resolve open buyer/seller disputes. Actions call the existing
                        resolve_dispute RPC and are recorded on both parties.
                    </p>
                </header>
                <DisputeList />
            </main>
            <Footer />
        </div>
    );
}

/* -------------------------------------------------------------------- */

function useAdminDisputes() {
    return useQuery({
        queryKey: ["admin-disputes"],
        enabled: Boolean(supabase),
        queryFn: async () => {
            if (!supabase) return [];
            const { data, error } = await supabase
                .from("disputes")
                .select(
                    `id, auction_id, buyer_id, seller_id, reason, status,
                     resolution, created_at,
                     auction:auctions ( id, title ),
                     escrow:escrow_transactions ( amount, status )`
                )
                .in("status", ["OPEN", "UNDER_REVIEW"])
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) throw error;
            return data ?? [];
        },
    });
}

function DisputeList() {
    const { data, isLoading, isError, error } = useAdminDisputes();

    if (isLoading) {
        return (
            <div data-testid="admin-disputes-loading" className="bz-card p-8 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white/60" />
            </div>
        );
    }
    if (isError) {
        return (
            <div data-testid="admin-disputes-error" className="bz-card p-6 text-sm text-red-300/90">
                Could not load disputes — {error?.message || "unknown error"}.
            </div>
        );
    }
    if (!data || data.length === 0) {
        return (
            <div data-testid="admin-disputes-empty" className="bz-card p-10 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-6 w-6 text-[hsl(var(--bz-green))]" />
                <p className="text-sm text-white/70">No open disputes — nothing to review.</p>
            </div>
        );
    }

    return (
        <ul data-testid="admin-disputes-list" className="space-y-3">
            {data.map((d) => (
                <DisputeRow key={d.id} dispute={d} />
            ))}
        </ul>
    );
}

function DisputeRow({ dispute }) {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(null); // 'RELEASE_SELLER' | 'REFUND_BUYER' | 'CANCEL_DISPUTE'
    const [notes, setNotes] = useState("");

    const amount = dispute.escrow?.[0]?.amount ?? dispute.escrow?.amount ?? null;
    const escrowStatus = dispute.escrow?.[0]?.status ?? dispute.escrow?.status ?? null;

    async function resolve(action) {
        if (busy) return;
        setBusy(action);
        try {
            const { error } = await supabase.rpc("resolve_dispute", {
                p_dispute_id: dispute.id,
                p_resolution: action,
                p_notes: notes.trim() || null,
            });
            if (error) throw error;
            toast.success("Dispute resolved", {
                description:
                    action === "RELEASE_SELLER"
                        ? "Funds released to seller."
                        : action === "REFUND_BUYER"
                        ? "Funds refunded to buyer."
                        : "Dispute cancelled.",
            });
            qc.invalidateQueries({ queryKey: ["admin-disputes"] });
        } catch (e) {
            toast.error("Could not resolve dispute", { description: e.message });
        } finally {
            setBusy(null);
        }
    }

    return (
        <li
            data-testid="admin-dispute-row"
            data-dispute-id={dispute.id}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Auction</p>
                    <p data-testid="admin-dispute-title" className="text-sm font-semibold text-white truncate">
                        {dispute.auction?.title || "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-white/50">
                        {new Date(dispute.created_at).toLocaleString()}
                        {amount != null && (
                            <> · Escrow <span className="tabular-nums text-white/80">{amount}</span> MON</>
                        )}
                        {escrowStatus && <> · <span className="uppercase">{escrowStatus}</span></>}
                    </p>
                </div>
                <span
                    data-testid="admin-dispute-status"
                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--bz-red)/0.45)] bg-[hsl(var(--bz-red)/0.1)] px-2.5 py-1 text-[10px] font-semibold text-white"
                >
                    <AlertTriangle className="h-3 w-3" />
                    {dispute.status}
                </span>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-widest text-white/40">Buyer reason</p>
                <p data-testid="admin-dispute-reason" className="mt-1 text-sm text-white/80 break-words">
                    {dispute.reason || "(no reason provided)"}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px] text-white/55">
                <div className="rounded-lg bg-black/20 px-3 py-2 truncate">
                    <span className="text-white/40">Buyer:</span>{" "}
                    <span data-testid="admin-dispute-buyer" className="font-mono text-white/80">
                        {dispute.buyer_id}
                    </span>
                </div>
                <div className="rounded-lg bg-black/20 px-3 py-2 truncate">
                    <span className="text-white/40">Seller:</span>{" "}
                    <span data-testid="admin-dispute-seller" className="font-mono text-white/80">
                        {dispute.seller_id}
                    </span>
                </div>
            </div>

            <div>
                <label className="text-[10px] uppercase tracking-widest text-white/40">
                    Resolution notes (optional)
                </label>
                <input
                    data-testid="admin-dispute-notes"
                    className="bz-input mt-1 w-full"
                    placeholder="Internal note for both parties"
                    value={notes}
                    maxLength={240}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
                <button
                    type="button"
                    data-testid="admin-resolve-release"
                    onClick={() => resolve("RELEASE_SELLER")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                >
                    {busy === "RELEASE_SELLER" && <Loader2 className="h-3 w-3 animate-spin" />}
                    <CheckCircle2 className="h-3 w-3" /> Release to Seller
                </button>
                <button
                    type="button"
                    data-testid="admin-resolve-refund"
                    onClick={() => resolve("REFUND_BUYER")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-red)/0.45)] bg-[hsl(var(--bz-red)/0.1)] px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                >
                    {busy === "REFUND_BUYER" && <Loader2 className="h-3 w-3 animate-spin" />}
                    <XCircle className="h-3 w-3" /> Refund Buyer
                </button>
                <button
                    type="button"
                    data-testid="admin-resolve-cancel"
                    onClick={() => resolve("CANCEL_DISPUTE")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bz-btn-secondary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                >
                    {busy === "CANCEL_DISPUTE" && <Loader2 className="h-3 w-3 animate-spin" />}
                    <RotateCcw className="h-3 w-3" /> Cancel Dispute
                </button>
            </div>
        </li>
    );
}
