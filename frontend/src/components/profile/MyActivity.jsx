import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
    Gavel, Package, Truck, MapPin, ShieldCheck, Clock, Loader2,
    CheckCircle2, AlertTriangle, Send, X, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { resolveMediaUrls } from "@/lib/storage";
import { AddressModal } from "@/components/auction/AddressModal";
import {
    useMyBids, useMyPurchases, useMySales, useMyAddresses,
    submitShippingAddress, recordShipment, confirmReceipt, openDispute,
    markEscrowFunded, updateTrackingStatus, BackendUnavailableError,
    trackingLabel, escrowLabel, statusTone, feeBreakdown,
} from "@/lib/shipping";
import { shortAddr } from "@/components/auction/format";
import { useWallet } from "@/context/WalletContext";
import { MyCollection } from "@/components/collection/MyCollection";
import { MONAD } from "@/lib/monad";

/**
 * BIDZONE Phase 7 — MY ACTIVITY (My Bids / My Purchases / My Sales).
 *
 * Extends the existing Profile architecture. Reads ONLY tables the user is
 * already allowed to read (bids public, escrow/shipping/disputes party-RLS).
 * Mutations go through the EXISTING Phase 4.2 lifecycle RPCs; service-role
 * steps (fund stamp, manual tracking updates) go through the app backend,
 * which surfaces an honest error until the service key is configured.
 */

const TRACKING_ACTIVE = ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

export function MyActivity() {
    const [tab, setTab] = useState("purchases");

    return (
        <section data-testid="activity-card" className="bz-card p-5 md:p-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-white">My Activity</h2>
                    <p className="text-xs text-white/45 mt-0.5">
                        Bids, purchases and sales — live from the existing escrow & shipping lifecycle.
                    </p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.06] p-1 self-start">
                    <TabBtn testId="activity-tab-purchases" active={tab === "purchases"} onClick={() => setTab("purchases")}>
                        <Package className="h-3.5 w-3.5" /> Purchases
                    </TabBtn>
                    <TabBtn testId="activity-tab-sales" active={tab === "sales"} onClick={() => setTab("sales")}>
                        <Gavel className="h-3.5 w-3.5" /> Sales
                    </TabBtn>
                    <TabBtn testId="activity-tab-bids" active={tab === "bids"} onClick={() => setTab("bids")}>
                        <Clock className="h-3.5 w-3.5" /> Bids
                    </TabBtn>
                    <TabBtn testId="activity-tab-collection" active={tab === "collection"} onClick={() => setTab("collection")}>
                        <Package className="h-3.5 w-3.5" /> Collection
                    </TabBtn>
                </div>
            </header>

            <div className="mt-5">
                {tab === "purchases" && <Purchases />}
                {tab === "sales" && <Sales />}
                {tab === "bids" && <Bids />}
                {tab === "collection" && <MyCollection />}
            </div>
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
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition " +
                (active
                    ? "bg-[hsl(var(--bz-purple)/0.18)] text-[hsl(var(--bz-purple))]"
                    : "text-white/50 hover:text-white")
            }
        >
            {children}
        </button>
    );
}

/* ============================== MY BIDS ============================== */
function Bids() {
    const { data, isLoading } = useMyBids();
    if (isLoading) return <Skeleton />;
    if (!data.length) return <Empty text="No bids yet — join a live auction!" testId="activity-bids-empty" />;
    return (
        <ul className="space-y-2" data-testid="activity-bids-list">
            {data.map((b) => {
                const label =
                    b.status === "ACTIVE" ? "Active" : b.status === "WINNING" ? "Highest" : b.status;
                const toneKey =
                    b.status === "WINNING" ? "RELEASED" : b.status === "ACTIVE" ? "FUNDED" : "REFUNDED";
                return (
                    <li key={b.id} data-testid="activity-bid-row"
                        className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <Thumb auction={b.auction} />
                        <div className="min-w-0 flex-1">
                            <Link to={`/auction/${b.auction_id}`}
                                className="block truncate text-sm font-medium text-white/90 hover:text-white">
                                {b.auction?.title || "Auction"}
                            </Link>
                            <div className="text-[11px] text-white/40 mt-0.5">
                                {new Date(b.created_at).toLocaleString()}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-white tabular-nums">
                                {fmt(b.amount)} MON
                            </div>
                            <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(toneKey)}`}>
                                {label}
                            </span>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/* ============================ MY PURCHASES =========================== */
function Purchases() {
    const { data, isLoading, refetch } = useMyPurchases();
    if (isLoading) return <Skeleton />;
    if (!data.length)
        return <Empty text="No purchases yet — win an auction and it appears here." testId="activity-purchases-empty" />;

    return (
        <ul className="space-y-4" data-testid="activity-purchases-list">
            {data.map((p) => (
                <li key={p.id} data-testid="activity-purchase-row" className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-3">
                        <Thumb auction={p.auction} />
                        <div className="min-w-0 flex-1">
                            <Link to={`/auction/${p.auction_id}`}
                                className="block truncate text-sm font-semibold text-white hover:underline">
                                {p.auction?.title || "Auction"}
                            </Link>
                            <div className="text-[11px] text-white/45 mt-0.5">
                                Winning bid <span className="text-white tabular-nums">{fmt(p.amount)} MON</span>
                            </div>
                        </div>
                        <Chip status={p.status} label={escrowLabel(p.status)} testId="purchase-escrow-status" />
                    </div>

                    {/* Fulfillment ladder (PHYSICAL) */}
                    {p.auction?.auction_type === "PHYSICAL" && (
                        <div className="mt-3 border-t border-white/[0.05] pt-3">
                            <EscrowStates purchase={p} refetch={refetch} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

function EscrowStates({ purchase, refetch }) {
    const s = purchase.shipping || null;
    const escrowStatus = purchase.status;

    if (escrowStatus === "PENDING") {
        return <PendingPayment purchase={purchase} refetch={refetch} />;
    }
    if (escrowStatus === "FUNDED" && !s) {
        return <ProvideAddress purchase={purchase} refetch={refetch} />;
    }
    if (escrowStatus === "FUNDED" && s && s.tracking_status === "PENDING") {
        return (
            <div className="space-y-2" data-testid="purchase-preparing">
                <Step done text="Payment secured" />
                <Step done text="Shipping address sent to seller" />
                <Row2 icon={Truck} label="Seller preparing shipment" testid="purchase-shipping-status">
                    <Chip status="PENDING" label="Preparing" />
                </Row2>
                {purchase.ship_by && <Deadline text="Ship-by deadline" at={purchase.ship_by} />}
            </div>
        );
    }
    if (escrowStatus === "FUNDED" && s && TRACKING_ACTIVE.includes(s.tracking_status)) {
        return (
            <div className="space-y-2">
                <Step done text="Payment secured" />
                <Step done text="Shipped" />
                <Row2 icon={Truck} label={trackingLabel(s.tracking_status)} testid="purchase-shipping-status">
                    <Chip status={s.tracking_status} label={trackingLabel(s.tracking_status)} />
                </Row2>
                {s.carrier && s.tracking_number && (
                    <p className="rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/70" data-testid="purchase-tracking">
                        Carrier: <span className="text-white">{s.carrier}</span> · Tracking:{" "}
                        <span className="font-mono text-white">{s.tracking_number}</span>
                    </p>
                )}
            </div>
        );
    }
    if (escrowStatus === "FUNDED" && s && s.tracking_status === "DELIVERED") {
        return <ConfirmationWindow purchase={purchase} shipping={s} refetch={refetch} />;
    }
    if (escrowStatus === "RELEASED") {
        return (
            <div className="space-y-2" data-testid="purchase-completed">
                <Step done text="Payment secured" />
                {s?.tracking_status && <Step done text={`Delivery: ${trackingLabel(s.tracking_status)}`} />}
                <Row2 icon={CheckCircle2} label="Purchase completed" testid="purchase-completed-label">
                    <Chip status="RELEASED" label="Completed" />
                </Row2>
            </div>
        );
    }
    if (escrowStatus === "DISPUTED") {
        return (
            <div className="space-y-2" data-testid="purchase-disputed">
                <Row2 icon={AlertTriangle} label="Dispute opened — escrow frozen, auto-release paused"
                    testid="purchase-dispute-status">
                    <Chip status="DISPUTED" label="Disputed" />
                </Row2>
                <p className="text-[11px] text-white/45">
                    A moderator resolution (release or refund) will be applied to the escrow.
                </p>
            </div>
        );
    }
    if (escrowStatus === "REFUNDED") {
        return (
            <div className="space-y-2" data-testid="purchase-refunded">
                <Row2 icon={AlertTriangle} label="Refunded — escrow returned to you" testid="purchase-refund-label">
                    <Chip status="REFUNDED" label="Refunded" />
                </Row2>
            </div>
        );
    }
    return null;
}

function PendingPayment({ purchase, refetch }) {
    const { session } = useAuth();
    const [busy, setBusy] = useState(false);
    async function secure() {
        setBusy(true);
        try {
            await markEscrowFunded(purchase.auction_id, session, null);
            toast.success("Payment secured — escrow active");
            refetch();
        } catch (e) {
            if (e instanceof BackendUnavailableError) {
                toast.error("Payment stamp unavailable", {
                    description: "The backend service-role key is not configured yet (SERVICE_ROLE_NOT_CONFIGURED).",
                });
            } else {
                toast.error("Could not secure payment", { description: e.message });
            }
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="space-y-2" data-testid="purchase-pending-payment">
            <Step done text="You won this auction" />
            <Row2 icon={ShieldCheck} label="Awaiting payment confirmation" testid="purchase-awaiting-payment">
                <button type="button" data-testid="purchase-secure-payment" onClick={secure}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60">
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    Payment secured
                </button>
            </Row2>
        </div>
    );
}

function ProvideAddress({ purchase, refetch }) {
    const { data: addresses } = useMyAddresses();
    const [selected, setSelected] = useState(null);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const chosen = selected || (addresses && addresses[0]) || null;

    if (!addresses || addresses.length === 0) {
        return (
            <>
                <div className="space-y-2" data-testid="purchase-no-address">
                    <Step done text="Payment secured" />
                    <Row2 icon={MapPin} label="Shipping address required" testid="purchase-address-required">
                        <button type="button" data-testid="purchase-add-address" onClick={() => setAdding(true)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-purple)/0.6)] bg-[hsl(var(--bz-purple)/0.14)] px-4 py-1.5 text-[11px] font-semibold text-white">
                            <MapPin className="h-3 w-3 text-[hsl(var(--bz-purple))]" />
                            Add Shipping Address
                        </button>
                    </Row2>
                </div>
                <AddressModal open={adding} onClose={() => setAdding(false)} />
            </>
        );
    }

    async function send() {
        if (!chosen) return;
        setBusy(true);
        try {
            await submitShippingAddress(purchase.auction_id, chosen.id);
            toast.success("Address sent to the seller — fulfillment started");
            refetch();
        } catch (e) {
            toast.error("Could not send address", { description: e.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2" data-testid="purchase-provide-address">
            <Step done text="Payment secured" />
            <Row2 icon={MapPin} label="Choose the delivery address" testid="purchase-pick-address">
                <button type="button" data-testid="purchase-send-address" onClick={send} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60">
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Send className="h-3 w-3" /> Send to seller
                </button>
            </Row2>
            <ul className="space-y-1.5">
                {addresses.map((a) => (
                    <li key={a.id}>
                        <button
                            type="button"
                            data-testid={`purchase-address-option-${a.id}`}
                            aria-pressed={chosen?.id === a.id}
                            onClick={() => setSelected(a)}
                            className={
                                "w-full rounded-xl border px-3 py-2 text-left text-[11px] transition " +
                                (chosen?.id === a.id
                                    ? "border-[hsl(var(--bz-purple)/0.6)] bg-[hsl(var(--bz-purple)/0.1)] text-white"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/20")
                            }
                        >
                            <span className="font-medium">{a.recipient_name}</span> — {a.address_line}, {a.city},{" "}
                            {a.country}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ConfirmationWindow({ purchase, refetch }) {
    const [reason, setReason] = useState("");
    const [disputing, setDisputing] = useState(false);
    const [busy, setBusy] = useState(false);

    async function confirm() {
        setBusy(true);
        try {
            await confirmReceipt(purchase.auction_id);
            toast.success("Receipt confirmed — escrow released (2.5% platform fee applied at settlement)");
            refetch();
        } catch (e) {
            toast.error("Could not confirm", { description: e.message });
        } finally {
            setBusy(false);
        }
    }

    async function dispute() {
        if (!reason.trim()) {
            toast.error("Describe the problem first");
            return;
        }
        setBusy(true);
        try {
            await openDispute(purchase.auction_id, reason.trim());
            toast.success("Dispute opened — escrow frozen until resolution");
            setDisputing(false);
            setReason("");
            refetch();
        } catch (e) {
            toast.error("Could not open dispute", { description: e.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2" data-testid="purchase-confirmation-window">
            <Step done text="Payment secured" />
            <Step done text="Shipped" />
            <Row2 icon={CheckCircle2} label="Delivered" testid="purchase-delivered-label">
                <Chip status="DELIVERED" label="Delivered" />
            </Row2>
            {purchase.confirmation_deadline && (
                <Deadline text="Confirm within" at={purchase.confirmation_deadline} testid="purchase-confirm-deadline" />
            )}
            {disputing ? (
                <div className="rounded-xl border border-[hsl(var(--bz-red)/0.35)] bg-[hsl(var(--bz-red)/0.08)] p-3">
                    <input
                        data-testid="dispute-reason-input"
                        className="bz-input w-full"
                        placeholder="What went wrong? (reason)"
                        value={reason}
                        maxLength={200}
                        onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="mt-2 flex gap-2">
                        <button type="button" data-testid="dispute-submit" onClick={dispute} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-red)/0.5)] bg-[hsl(var(--bz-red)/0.14)] px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60">
                            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                            Open Dispute
                        </button>
                        <button type="button" data-testid="dispute-cancel" onClick={() => setDisputing(false)}
                            className="inline-flex items-center gap-1 rounded-full bz-btn-secondary px-4 py-1.5 text-[11px] font-semibold">
                            <X className="h-3 w-3" /> Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <button type="button" data-testid="purchase-confirm-receipt" onClick={confirm} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60">
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                        Confirm Receipt
                    </button>
                    <button type="button" data-testid="purchase-open-dispute" onClick={() => setDisputing(true)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-red)/0.45)] bg-[hsl(var(--bz-red)/0.1)] px-4 py-1.5 text-[11px] font-semibold text-white">
                        <AlertTriangle className="h-3 w-3" /> Open Dispute
                    </button>
                </div>
            )}
        </div>
    );
}

/* ============================== MY SALES ============================= */
function Sales() {
    const { data, isLoading, refetch } = useMySales();
    if (isLoading) return <Skeleton />;
    if (!data.length) return <Empty text="No sales yet — create an auction to get started." testId="activity-sales-empty" />;

    return (
        <ul className="space-y-4" data-testid="activity-sales-list">
            {data.map((s) => (
                <li key={s.id} data-testid="activity-sale-row" className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-3">
                        <Thumb auction={s} />
                        <div className="min-w-0 flex-1">
                            <Link to={`/auction/${s.id}`} className="block truncate text-sm font-semibold text-white hover:underline">
                                {s.title}
                            </Link>
                            <div className="text-[11px] text-white/45 mt-0.5">
                                {s.current_bid ? (
                                    <>Winning bid <span className="text-white tabular-nums">{fmt(s.current_bid)} MON</span></>
                                ) : (
                                    <>Starting bid <span className="text-white tabular-nums">{fmt(s.starting_bid)} MON</span></>
                                )}
                            </div>
                        </div>
                        {s.escrow ? (
                            <Chip status={s.escrow.status} label={escrowLabel(s.escrow.status)} testId="sale-escrow-status" />
                        ) : (
                            <Chip status={s.status} label={s.status === "LIVE" ? "Live" : s.status} testId="sale-auction-status" />
                        )}
                    </div>
                    {s.escrow && (
                        <div className="mt-3 border-t border-white/[0.05] pt-3">
                            <SaleFulfillment sale={s} refetch={refetch} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

function SaleFulfillment({ sale, refetch }) {
    const escrow = sale.escrow;
    const shipping = sale.shipping;

    if (escrow.status === "PENDING") {
        return (
            <div className="space-y-2" data-testid="sale-awaiting-payment">
                <Row2 icon={Gavel} label={`Winner: ${shortAddr(sale.winner_wallet || escrow.buyer_id)}`} testid="sale-winner">
                    <Chip status="PENDING" label="Awaiting payment" />
                </Row2>
            </div>
        );
    }

    const fee = feeBreakdown(escrow.amount);

    if (escrow.status === "FUNDED" && !shipping) {
        return (
            <div className="space-y-2" data-testid="sale-waiting-address">
                <Row2 icon={ShieldCheck} label="Payment secured — waiting for the buyer's shipping address" testid="sale-payment-secured">
                    <Chip status="FUNDED" label="Payment secured" />
                </Row2>
                {escrow.ship_by && <Deadline text="Ship-by deadline" at={escrow.ship_by} />}
            </div>
        );
    }

    if (escrow.status === "FUNDED" && shipping && shipping.tracking_status === "PENDING") {
        return (
            <div className="space-y-2" data-testid="sale-fulfillment">
                <Step done text="Payment secured" />
                <Row2 icon={MapPin} label="Buyer shipping address" testid="sale-buyer-address">
                    <Chip status="PENDING" label="Preparing" />
                </Row2>
                <BuyerAddress auctionId={sale.id} />
                {escrow.ship_by && <Deadline text="Ship-by deadline" at={escrow.ship_by} />}
                <ShipForm auctionId={sale.id} refetch={refetch} />
            </div>
        );
    }

    if (TRACKING_ACTIVE.includes(shipping?.tracking_status) && escrow.status === "FUNDED") {
        return (
            <div className="space-y-2" data-testid="sale-shipped">
                <Step done text="Payment secured" />
                <Row2 icon={Truck} label={`Shipped via ${shipping.carrier} · ${shipping.tracking_number}`} testid="sale-tracking">
                    <Chip status={shipping.tracking_status} label={trackingLabel(shipping.tracking_status)} />
                </Row2>
                <TrackingButtons sale={sale} refetch={refetch} />
            </div>
        );
    }

    if (escrow.status === "DISPUTED") {
        return (
            <div className="space-y-2" data-testid="sale-disputed">
                <Row2 icon={AlertTriangle} label="Buyer disputed the order — escrow frozen" testid="sale-dispute-status">
                    <Chip status="DISPUTED" label="Disputed" />
                </Row2>
                <p className="text-[11px] text-white/45">Admin/moderator resolution decides release or refund.</p>
            </div>
        );
    }

    if (escrow.status === "RELEASED") {
        return (
            <div className="space-y-1.5 text-[11px] text-white/60" data-testid="sale-settled">
                <Row2 icon={CheckCircle2} label="Sale completed" testid="sale-completed-label">
                    <Chip status="RELEASED" label="Completed" />
                </Row2>
                <div className="rounded-xl bg-black/25 px-3 py-2 space-y-0.5" data-testid="sale-fee-breakdown">
                    <div className="flex justify-between"><span>Winning bid</span><span className="text-white tabular-nums">{fmt(escrow.amount)} MON</span></div>
                    <div className="flex justify-between"><span>BIDZONE fee (2.5%)</span><span className="text-white tabular-nums">{fee.fee} MON</span></div>
                    <div className="flex justify-between font-semibold"><span>You receive</span><span className="text-white tabular-nums">{fee.received} MON</span></div>
                </div>
            </div>
        );
    }

    if (escrow.status === "REFUNDED") {
        return (
            <div className="space-y-2" data-testid="sale-refunded">
                <Row2 icon={AlertTriangle} label="Order refunded to the buyer (shipping deadline missed)" testid="sale-refund-label">
                    <Chip status="REFUNDED" label="Refunded" />
                </Row2>
            </div>
        );
    }
    return null;
}

/** Seller reads the buyer address via the fulfillment RLS policy (Phase 7). */
function BuyerAddress({ auctionId }) {
    const [addr, setAddr] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from("shipping")
                    .select(
                        `shipping_address_id,
                         address:addresses ( recipient_name, phone, address_line, city, province, country, postal_code )`
                    )
                    .eq("auction_id", auctionId)
                    .single();
                if (error) throw error;
                if (cancelled) return;
                setAddr(data && data.address ? data.address : null);
                setLoaded(true);
            } catch (e) {
                if (!cancelled) {
                    setErr(e.message);
                    setLoaded(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [auctionId]);

    if (err || (loaded && !addr)) {
        return (
            <p className="rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/50" data-testid="sale-address-error">
                Address hidden — apply the Phase 7 RLS migration (addresses_select_fulfillment_seller) to enable seller view.
            </p>
        );
    }
    if (!addr) {
        return <p className="text-[11px] text-white/40">Loading address…</p>;
    }
    return (
        <p className="rounded-xl bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-white/80" data-testid="sale-address">
            <span className="font-semibold text-white">{addr.recipient_name}</span>
            {addr.phone ? ` · ${addr.phone}` : ""}
            <br />
            {addr.address_line}, {addr.city}
            {addr.province ? `, ${addr.province}` : ""}, {addr.country}
            {addr.postal_code ? ` ${addr.postal_code}` : ""}
        </p>
    );
}

function ShipForm({ auctionId, refetch }) {
    const [carrier, setCarrier] = useState("");
    const [tracking, setTracking] = useState("");
    const [busy, setBusy] = useState(false);

    async function ship() {
        if (!carrier.trim() || !tracking.trim()) {
            toast.error("Carrier and tracking number are required");
            return;
        }
        setBusy(true);
        try {
            await recordShipment(auctionId, carrier.trim(), tracking.trim());
            toast.success("Marked as shipped");
            refetch();
        } catch (e) {
            toast.error("Could not mark as shipped", { description: e.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 space-y-2" data-testid="sale-ship-form">
            <input className="bz-input w-full" data-testid="sale-carrier-input" placeholder="Carrier (e.g. JNE)"
                value={carrier} maxLength={60} onChange={(e) => setCarrier(e.target.value)} />
            <input className="bz-input w-full" data-testid="sale-tracking-input" placeholder="Tracking number"
                value={tracking} maxLength={80} onChange={(e) => setTracking(e.target.value)} />
            <button type="button" data-testid="sale-ship-submit" onClick={ship} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60">
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                <Truck className="h-3 w-3" /> Mark as Shipped
            </button>
        </div>
    );
}

function TrackingButtons({ sale, refetch }) {
    const { session } = useAuth();
    const [busy, setBusy] = useState(false);
    async function update(status) {
        setBusy(true);
        try {
            await updateTrackingStatus(sale.id, session, status);
            toast.success(`Tracking updated: ${trackingLabel(status)}`);
            refetch();
        } catch (e) {
            if (e instanceof BackendUnavailableError) {
                toast.error("Tracking update unavailable", {
                    description: "The backend service-role key is not configured yet (SERVICE_ROLE_NOT_CONFIGURED).",
                });
            } else {
                toast.error("Could not update tracking", { description: e.message });
            }
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="flex flex-wrap gap-2" data-testid="sale-tracking-buttons">
            {sale.shipping?.tracking_status === "SHIPPED" && (
                <button type="button" data-testid="sale-mark-transit" onClick={() => update("IN_TRANSIT")} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bz-btn-secondary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60">
                    Mark In Transit
                </button>
            )}
            {sale.shipping?.tracking_status &&
                ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(sale.shipping.tracking_status) && (
                    <button type="button" data-testid="sale-mark-delivered" onClick={() => update("DELIVERED")} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold disabled:opacity-60">
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                        Mark Delivered
                    </button>
                )}
        </div>
    );
}

/* ============================== SHARED =============================== */
function Thumb({ auction }) {
    const item =
        (auction?.auction_items || []).find((i) => i.media_type === "IMAGE") ||
        auction?.auction_items?.[0] ||
        null;
    return (
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[hsl(var(--bz-surface))]">
            {item ? (
                <ThumbImg item={item} />
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-4 w-4 text-white/30" />
                </div>
            )}
        </div>
    );
}

function ThumbImg({ item }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resolved = await resolveMediaUrls([item]);
                if (!cancelled) setUrl(resolved?.[0]?.media_url || null);
            } catch {
                /* honest empty */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [item]);
    return url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
    ) : (
        <div className="flex h-full w-full items-center justify-center">
            <Package className="h-4 w-4 text-white/30" />
        </div>
    );
}

function Chip({ status, label, testId }) {
    return (
        <span data-testid={testId} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(status)}`}>
            {label}
        </span>
    );
}

function Step({ text }) {
    return (
        <div className="flex items-center gap-2 text-[11px] text-white/60">
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--bz-green))]" />
            {text}
        </div>
    );
}

function Row2({ icon: Icon, label, children, testid }) {
    return (
        <div data-testid={testid} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-xs text-white/80">
                <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--bz-purple))]" />
                <span className="truncate">{label}</span>
            </span>
            {children}
        </div>
    );
}

function Deadline({ text, at, testid }) {
    const hours = Math.max(0, Math.round((new Date(at).getTime() - Date.now()) / 3600000));
    const overdue = hours === 0;
    return (
        <p data-testid={testid} className={`flex items-center gap-1.5 text-[11px] ${overdue ? "text-[hsl(var(--bz-red))]" : "text-white/50"}`}>
            <Clock className="h-3 w-3" />
            {text}: {overdue ? "passed — the lifecycle job will act" : `${hours}h remaining`}
        </p>
    );
}

function Skeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
            ))}
        </div>
    );
}

function Empty({ text, testId }) {
    return (
        <div data-testid={testId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
            <Package className="mx-auto h-5 w-5 text-white/40" />
            <p className="mt-2 text-sm text-white/60">{text}</p>
        </div>
    );
}

function fmt(n) {
    try {
        const v = Number(n);
        return isFinite(v) ? String(parseFloat(v.toFixed(6))) : String(n);
    } catch {
        return String(n);
    }
}

