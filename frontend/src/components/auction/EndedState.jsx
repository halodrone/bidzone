import { useEffect, useState } from "react";
import { Trophy, PackageOpen, Crown, Loader2, ExternalLink, CheckCircle2, ShieldCheck, Truck, Gavel, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuctionBids } from "@/hooks/useAuctionRoom";
import { fmtAmount, shortAddr, timeAgo } from "@/components/auction/format";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/context/AuthContext";
import { isOnchainAvailable, settleAuctionOnchain, toExplorerTx, readAuctionStatus } from "@/lib/bidzoneAuction";
import { isNftAvailable, settleNftAuctionOnchain, readEscrowStatus } from "@/lib/nft";
import { recordNftEvent } from "@/lib/nftIndex";
import { trackingLabel, feeBreakdown } from "@/lib/shipping";
import { supabase } from "@/lib/supabase";
import { MONAD } from "@/lib/monad";
import {
    ProvideAddress,
    ConfirmationWindow,
    ShipForm,
    TrackingButtons,
} from "@/components/profile/MyActivity";

/**
 * Ended-state banner. Only renders when auction.status === 'ENDED'.
 * A winner is shown only when the WINNING bid actually exists in the
 * database — never inferred client-side.
 */
export function EndedState({ auction }) {
    const { data, isError: bidsError, isLoading: bidsLoading } = useAuctionBids(auction.id, { limit: 5 });
    const { user } = useAuth();
    const winning = (data?.rows ?? []).find((b) => b.status === "WINNING");

    // Never claim "no sale" while the result set is unknown — a transient
    // fetch failure must degrade to an honest loading/error state instead.
    if (!winning && (bidsLoading || bidsError)) {
        return (
            <section data-testid="auction-ended-loading" className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
                <p className="text-sm text-white/55">
                    {bidsError ? "Results are temporarily unavailable — refresh to re-check." : "Reading final results…"}
                </p>
            </section>
        );
    }

    if (!winning) {
        return (
            <section
                data-testid="auction-no-sale"
                className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8"
            >
                <div className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40">
                        <PackageOpen className="h-5 w-5 text-white/60" />
                    </span>
                    <div>
                        <h3 className="font-display text-xl font-semibold">
                            Auction ended — no sale.
                        </h3>
                        <p className="mt-1 text-sm text-white/55">
                            No valid bids were placed before the timer ran out.
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section
            data-testid="auction-winner"
            className="relative overflow-hidden rounded-3xl border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.06)] p-6 md:p-8"
        >
            <div
                aria-hidden
                className="pointer-events-none absolute -top-16 right-0 h-40 w-64 rounded-full bg-[hsl(var(--bz-purple)/0.35)] blur-3xl"
            />
            <div className="relative flex items-start gap-3 sm:gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--bz-purple)/0.55)] bg-[hsl(var(--bz-purple)/0.14)]">
                    <Trophy className="h-5 w-5 text-[hsl(var(--bz-purple))]" />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="font-display text-xl font-semibold">
                        Auction won.
                    </h3>
                    <p className="mt-1 text-sm text-white/60">
                        {auction.auction_type === "PHYSICAL" && user?.id === winning.bidder_id
                            ? "You won. Your payment is secured in escrow — the seller ships next."
                            : "Awaiting settlement. The winning bidder proceeds to escrow."}
                    </p>
                    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                            <dt className="text-[10px] uppercase tracking-widest text-white/40">
                                Winner
                            </dt>
                            <dd
                                data-testid="auction-winner-address"
                                className="mt-0.5 flex items-center gap-1.5 font-medium text-white"
                            >
                                <Crown className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                                {shortAddr(winning.wallet_address)}
                            </dd>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                            <dt className="text-[10px] uppercase tracking-widest text-white/40">
                                Final bid
                            </dt>
                            <dd
                                data-testid="auction-winner-amount"
                                className="mt-0.5 font-display text-xl font-bold tabular-nums"
                            >
                                {fmtAmount(winning.amount)}
                                <span className="ml-1 text-[10px] font-medium text-white/45 tracking-widest">
                                    MON
                                </span>
                            </dd>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                            <dt className="text-[10px] uppercase tracking-widest text-white/40">
                                Placed
                            </dt>
                            <dd className="mt-0.5 text-sm text-white/80">
                                {timeAgo(winning.created_at)}
                            </dd>
                        </div>
                    </dl>
                    {auction.auction_type === "PHYSICAL" && user?.id === winning.bidder_id ? (
                        <p className="mt-4 text-[11px] text-white/40" data-testid="buyer-banner-completion-note">
                            Your purchase is complete — payment and delivery status are managed in your purchase panel.
                        </p>
                    ) : auction.seller?.id === user?.id ? (
                        <p className="mt-4 text-[11px] text-white/40" data-testid="seller-banner-fee-note">
                            Seller settlement: 97.5% to you · 2.5% BIDZONE fee, released after the physical lifecycle completes.
                        </p>
                    ) : (
                        <p className="mt-4 text-[11px] text-white/40" data-testid="third-party-banner-note">
                            The auction result is recorded. Settlement details are visible to the seller only.
                        </p>
                    )}
                    {auction.auction_type === "NFT" ? (
                        <SettleNftAction auction={auction} />
                    ) : auction.auction_type === "PHYSICAL" ? (
                        <PhysicalSettlement auction={auction} winning={winning} />
                    ) : (
                        <SettleAction auction={auction} />
                    )}
                </div>
            </div>
        </section>
    );
}

/**
 * Phase 7.2 FINAL (Model B) — NFT settlement via BidzoneNFTEscrow:
 * NFT -> winner + 97.5% seller + 2.5% treasury, atomically + idempotently.
 * Chain-aware visibility: once the on-chain status is Settled, the button is
 * replaced by a settled chip (no double-settle attempts in the UI).
 */
function SettleNftAction({ auction }) {
    const { privyWallet, status: walletStatus } = useWallet();
    const { session } = useAuth();
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const [onchainStatus, setOnchainStatus] = useState(null); // null unknown

    const token = Array.isArray(auction.nft_tokens) ? auction.nft_tokens[0] : auction.nft_tokens;
    const tokenId = token?.token_id;
    const nftContract = token?.nft_contract;
    const configured = isNftAvailable() && tokenId && nftContract;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!configured) return;
            try {
                const st = await readEscrowStatus(nftContract, tokenId);
                if (!cancelled) setOnchainStatus(Number(st));
            } catch {
                if (!cancelled) setOnchainStatus(null);
            }
        })();
        return () => { cancelled = true; };
    }, [configured, nftContract, tokenId]);

    if (!configured) return null;
    if (onchainStatus === 3) {
        return (
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[hsl(var(--bz-green))]" data-testid="nft-settled-chip">
                <CheckCircle2 className="h-4 w-4" /> NFT settled — transferred to the winner on-chain.
            </p>
        );
    }
    if (onchainStatus === 4) {
        return (
            <p className="mt-4 text-xs text-white/50" data-testid="nft-cancelled-chip">
                Listing was cancelled — the NFT was reclaimed by the seller.
            </p>
        );
    }

    async function settleNft() {
        if (busy) return;
        setBusy(true);
        try {
            const { hash, receipt } = await settleNftAuctionOnchain({
                wallet: privyWallet,
                nftContract,
                tokenId,
            });
            setTxHash(hash);
            if (receipt.status !== "success") throw new Error("Settlement reverted on-chain");
            // Index the REAL settle tx (insert-own, best-effort).
            try {
                const found = await supabase.from("nft_tokens").select("id").eq("nft_contract", String(nftContract).toLowerCase()).eq("token_id", String(tokenId)).maybeSingle();
                if (found?.data) {
                    await recordNftEvent({ session, tokenRowId: found.data.id, eventType: "SETTLE", txHash: hash });
                }
            } catch { /* index best-effort */ }
            setOnchainStatus(3);
            qc.invalidateQueries({ queryKey: ["my-collection"] });
            qc.invalidateQueries({ queryKey: ["auction", auction.id] });
            toast.success("NFT auction settled on-chain", {
                description: "The NFT moved to the winner; seller received 97.5%, treasury 2.5%.",
            });
        } catch (e) {
            toast.error("Settlement failed", {
                description: (e && (e.shortMessage || e.message)) || "See wallet response.",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
                type="button"
                data-testid="settle-nft-onchain"
                disabled={busy || !privyWallet || walletStatus !== "ready"}
                onClick={settleNft}
                className="inline-flex items-center gap-2 rounded-full bz-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Settle NFT on-chain
            </button>
            {txHash && (
                <a
                    href={`${MONAD.explorer.replace(/\/$/, "")}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="settle-nft-tx-link"
                    className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
                >
                    <ExternalLink className="h-3 w-3" />
                    View on {MONAD.networkName || MONAD.network}
                </a>
            )}
        </div>
    );
}

/**
 * On-chain settlement trigger. Visible whenever Phase 6.5 is configured
 * AND the on-chain auction id exists on the DB row. Any wallet can pay
 * the gas to settle — the contract enforces winner/fee split.
 */
function SettleAction({ auction }) {
    const { privyWallet, status: walletStatus } = useWallet();
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState(null);

    const isConfigured =
        isOnchainAvailable() &&
        auction.contract_auction_id &&
        walletStatus === "ready" &&
        privyWallet;
    if (!isConfigured) return null;

    async function settle() {
        setBusy(true);
        try {
            const { hash, receipt } = await settleAuctionOnchain({
                wallet: privyWallet,
                uuid: auction.id,
            });
            setTxHash(hash);
            if (receipt.status !== "success") throw new Error("Settlement reverted on-chain");
            toast.success("Auction settled on-chain", {
                description: "Seller received 97.5%, treasury 2.5%.",
            });
        } catch (e) {
            toast.error("Settlement failed", {
                description: (e && (e.shortMessage || e.message)) || "See wallet response.",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
                type="button"
                data-testid="settle-onchain"
                disabled={busy}
                onClick={settle}
                className="inline-flex items-center gap-2 rounded-full bz-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Settle on-chain
            </button>
            {txHash && (
                <a
                    href={toExplorerTx(txHash)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="settle-tx-link"
                    className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
                >
                    <ExternalLink className="h-3 w-3" />
                    View on {MONAD.networkName}
                </a>
            )}
        </div>
    );
}

/**
 * Phase 7.3 — party-scoped escrow + shipping state for the ENDED banner.
 * Both tables are party-RLS (buyer/seller only); third parties legitimately
 * resolve to null rows — the UI renders no settlement surface for them.
 * Phase 7.5 (sync fix): the state now lives in react-query
 * (["escrow-room", auctionId]) so a successful lifecycle action ANYWHERE
 * (room, My Purchases, My Sales) invalidates ONE source of truth and every
 * mounted view converges to the same current state. A Supabase realtime
 * subscription on `shipping` (the table is in the realtime publication)
 * additionally refreshes the room across tabs/devices.
 */
function useAuctionEscrowState(auctionId) {
    const qc = useQueryClient();
    const query = useQuery({
        queryKey: ["escrow-room", auctionId],
        queryFn: async () => {
            if (!supabase) return { escrow: null, shipping: null };
            try {
                const [esc, shp] = await Promise.all([
                    supabase
                        .from("escrow_transactions")
                        .select("id,status,funded_at,ship_by,confirmation_deadline,transaction_hash")
                        .eq("auction_id", auctionId)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                    supabase
                        .from("shipping")
                        .select("carrier,tracking_number,tracking_url,tracking_status,shipped_at,delivered_at")
                        .eq("auction_id", auctionId)
                        .maybeSingle(),
                ]);
                let shipping = shp.data || null;
                if (shp.error && /tracking_url|column|schema cache/i.test(shp.error.message || "")) {
                    const fallback = await supabase
                        .from("shipping")
                        .select("carrier,tracking_number,tracking_status,shipped_at,delivered_at")
                        .eq("auction_id", auctionId)
                        .maybeSingle();
                    shipping = fallback.data || null;
                }
                return { escrow: esc.data || null, shipping };
            } catch {
                return { escrow: null, shipping: null };
            }
        },
        enabled: !!auctionId,
    });

    // Existing realtime pattern (same channel style as bids/comments).
    useEffect(() => {
        if (!supabase || !auctionId) return undefined;
        const ch = supabase
            .channel(`escrow-room-${auctionId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "shipping", filter: `auction_id=eq.${auctionId}` },
                () => qc.invalidateQueries({ queryKey: ["escrow-room", auctionId] })
            )
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [auctionId, qc]);

    return {
        loading: query.isLoading,
        escrow: query.data?.escrow ?? null,
        shipping: query.data?.shipping ?? null,
        refresh: () => qc.invalidateQueries({ queryKey: ["escrow-room", auctionId] }),
    };
}

/** Small section header used by the role-specific physical panels. */
function RoleSection({ icon: Icon, title, testid, children }) {
    return (
        <section data-testid={testid} className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
            <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                <Icon className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                {title}
            </h4>
            <div className="mt-3">{children}</div>
        </section>
    );
}

/** Read-only delivery progress rail (buyer view). */
const RAIL = [
    ["awaiting", "Awaiting seller shipment"],
    ["SHIPPED", "Shipped"],
    ["IN_TRANSIT", "In transit"],
    ["OUT_FOR_DELIVERY", "Out for delivery"],
    ["DELIVERED", "Delivered"],
];
function DeliveryRail({ status }) {
    const active = !status ? 0 : RAIL.findIndex(([k]) => k === status);
    return (
        <ol data-testid="buyer-delivery-rail" className="space-y-1.5">
            {RAIL.map(([k, label], i) => {
                const done = i < active;
                const current = i === active;
                return (
                    <li
                        key={k}
                        data-testid={`rail-${k.toLowerCase()}`}
                        className="flex items-center gap-2.5 text-[11px]"
                    >
                        <span
                            className={
                                "inline-block h-2 w-2 rounded-full " +
                                (done || current
                                    ? "bg-[hsl(var(--bz-purple))] shadow-[0_0_10px_hsl(var(--bz-purple)/0.7)]"
                                    : "bg-white/15")
                            }
                        />
                        <span className={done || current ? "text-white/85" : "text-white/35"}>
                            {label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * Phase 7.4 — PHYSICAL post-win experience, ROLE-SPECIFIC MENUS.
 *
 * Same physical auction, two intentionally different experiences:
 *   BUYER  — "Your Purchase": PAYMENT / DELIVERY / RECEIPT sections
 *            (payment status, carrier+tracking, delivery rail, and after
 *            DELIVERED the real Confirm Receipt / Open Dispute actions).
 *            Seller-only controls (Mark Shipped/In Transit/Delivered,
 *            Settle on-chain) are NEVER rendered for the buyer.
 *   SELLER — "Your Sale": SALE / SHIPPING / SETTLEMENT sections
 *            (winning bid + buyer, ship form + tracking controls, and the
 *            on-chain Settle on-chain action ONLY after escrow RELEASED).
 *            Buyer actions (Confirm Receipt / Open Dispute) are NEVER
 *            rendered for the seller.
 *   OTHERS — no post-win action surface at all.
 *
 * Role is derived per-auction (auction.seller.id / winning.bidder_id) — a
 * user may sell auction A and win auction B. All actions reuse the existing
 * party-gated RPCs via the shared components exported from MyActivity —
 * no duplicated logic, no schema/RLS/contract changes.
 */
function PhysicalSettlement({ auction, winning }) {
    const { user } = useAuth();
    const { privyWallet, status: walletStatus } = useWallet();
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const [onchainSettled, setOnchainSettled] = useState(false);
    const { loading, escrow, shipping, refresh } = useAuctionEscrowState(auction.id);

    const uid = user?.id;
    const isSeller = !!uid && auction.seller?.id === uid;
    const isBuyer = !!uid && winning.bidder_id === uid;

    // Chain-aware SETTLED state: the DB escrow row stays RELEASED after the
    // on-chain settle, so statusOf() is the honest source of truth for the
    // final "completed" presentation.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const st = await readAuctionStatus(auction.id);
                if (!cancelled && st === 4) setOnchainSettled(true);
            } catch {
                /* read-only; never blocks the UI */
            }
        })();
        return () => { cancelled = true; };
    }, [auction.id]);

    // Third parties (and unknown parties) get NO post-win action surface.
    if (!isSeller && !isBuyer) return null;
    if (loading) return null;

    const escrowStatus = escrow?.status || null;
    const tracking = shipping?.tracking_status || null;
    const sellerFee = feeBreakdown(winning.amount);
    const purchaseShape = {
        auction_id: auction.id,
        escrow_status: escrowStatus,
        confirmation_deadline: escrow?.confirmation_deadline || null,
        shipping,
    };

    // ============ BUYER — "Your Purchase": payment / delivery / receipt ============
    if (isBuyer) {
        return (
            <div className="mt-4 space-y-3" data-testid="physical-buyer-panel">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                    <PackageOpen className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                    Your Purchase
                </p>

                <RoleSection icon={ShieldCheck} title="Payment" testid="buyer-section-payment">
                    {(escrowStatus === "FUNDED" || escrowStatus === "RELEASED") ? (
                        <p
                            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] px-3 py-1 text-[11px] font-semibold text-[hsl(var(--bz-green))]"
                            data-testid="buyer-payment-secured"
                        >
                            <ShieldCheck className="h-3.5 w-3.5" /> Payment secured in escrow
                        </p>
                    ) : escrowStatus === "PENDING" ? (
                        <p className="text-[11px] text-white/55" data-testid="buyer-payment-pending">
                            Awaiting payment confirmation.
                        </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-white/55">
                        Winning bid:{" "}
                        <span className="font-semibold text-white">{fmtAmount(winning.amount)} {MONAD.currency}</span>
                        {escrow?.transaction_hash && (
                            <>
                                {" · "}
                                <a
                                    href={toExplorerTx(escrow.transaction_hash)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-white/70 hover:text-white"
                                    data-testid="buyer-payment-tx"
                                >
                                    <ExternalLink className="h-3 w-3" /> bid tx
                                </a>
                            </>
                        )}
                    </p>
                </RoleSection>

                <RoleSection icon={Truck} title="Delivery" testid="buyer-section-delivery">
                    {!shipping && escrowStatus === "FUNDED" ? (
                        <ProvideAddress purchase={purchaseShape} refetch={refresh} />
                    ) : (
                        <div className="space-y-3">
                            <DeliveryRail status={tracking} />
                            {shipping?.carrier && shipping?.tracking_number && (
                                <p className="rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/70" data-testid="buyer-tracking-info">
                                    {shipping.carrier} · <span className="font-mono text-white">{shipping.tracking_number}</span>
                                    {shipping.tracking_url && <a href={shipping.tracking_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[hsl(var(--bz-purple))] underline" data-testid="buyer-tracking-link">Track shipment <ExternalLink className="h-3 w-3" /></a>}
                                    {shipping.shipped_at ? ` · shipped ${timeAgo(shipping.shipped_at)}` : ""}
                                </p>
                            )}
                        </div>
                    )}
                </RoleSection>

                {escrowStatus === "FUNDED" && tracking === "DELIVERED" && (
                    <RoleSection icon={CheckCircle2} title="Receipt / Order Confirmation" testid="buyer-section-receipt">
                        <ConfirmationWindow purchase={purchaseShape} refetch={refresh} />
                    </RoleSection>
                )}

                {escrowStatus === "RELEASED" && (
                    <p className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] px-3 py-1 text-[11px] font-semibold text-[hsl(var(--bz-green))]" data-testid="buyer-released-note">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Receipt confirmed — purchase complete
                    </p>
                )}
                {escrowStatus === "REFUNDED" && (
                    <p className="text-[11px] text-white/55" data-testid="buyer-refunded-note">
                        Escrow refunded — the seller failed to ship in time or the dispute favored you.
                    </p>
                )}
                {escrowStatus === "DISPUTED" && (
                    <p className="text-[11px] text-white/55" data-testid="buyer-disputed-note">
                        Dispute open — escrow is frozen until it is resolved.
                    </p>
                )}
            </div>
        );
    }

    // ============ SELLER — "Your Sale": sale / shipping / settlement ============
    const settleReady =
        escrowStatus === "RELEASED" &&
        !onchainSettled &&
        isOnchainAvailable() &&
        auction.contract_auction_id &&
        walletStatus === "ready" &&
        privyWallet;

    async function settle() {
        setBusy(true);
        try {
            const { hash, receipt } = await settleAuctionOnchain({
                wallet: privyWallet,
                uuid: auction.id,
            });
            setTxHash(hash);
            if (receipt.status !== "success") throw new Error("Settlement reverted on-chain");
            setOnchainSettled(true);
            toast.success("Auction settled on-chain", {
                description: "Seller received 97.5%, treasury 2.5%.",
            });
        } catch (e) {
            toast.error("Settlement failed", {
                description: (e && (e.shortMessage || e.message)) || "See wallet response.",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-4 space-y-3" data-testid="physical-seller-panel">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                <Gavel className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                Your Sale
            </p>

            <RoleSection icon={Trophy} title="Sale" testid="seller-section-sale">
                <p className="text-sm text-white/85">
                    Winning bid:{" "}
                    <span className="font-semibold">{fmtAmount(winning.amount)} {MONAD.currency}</span>
                </p>
                <p className="mt-1 text-[11px] text-white/55">
                    Buyer:{" "}
                    <span className="font-mono text-white/75">
                        {shortAddr(winning.wallet_address) || "winner on record"}
                    </span>
                    {" · "}
                    Payment {escrowStatus === "PENDING" ? "awaiting confirmation" : "secured in escrow"}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px]" data-testid="physical-seller-fee-breakdown">
                    <div><dt className="text-white/40">Winning bid</dt><dd className="mt-1 font-semibold text-white">{fmtAmount(winning.amount)} MON</dd></div>
                    <div><dt className="text-white/40">Seller receives</dt><dd className="mt-1 font-semibold text-white">{sellerFee.received} MON · 97.5%</dd></div>
                    <div><dt className="text-white/40">BIDZONE fee</dt><dd className="mt-1 font-semibold text-white">{sellerFee.fee} MON · 2.5%</dd></div>
                </dl>
            </RoleSection>

            <RoleSection icon={Truck} title="Shipping" testid="seller-section-shipping">
                {(!shipping || shipping.tracking_status === "PENDING" || shipping.tracking_status === "LABEL_CREATED") ? (
                    escrowStatus === "FUNDED" ? (
                        <ShipForm auctionId={auction.id} refetch={refresh} />
                    ) : (
                        <p className="text-[11px] text-white/55">Shipping unlocks once payment is confirmed.</p>
                    )
                ) : (
                    <div className="space-y-2">
                        <p className="text-sm text-white/85">
                            {trackingLabel(tracking)}
                            {shipping.carrier ? ` · ${shipping.carrier}` : ""}
                            {shipping.tracking_number ? ` · ${shipping.tracking_number}` : ""}
                        </p>
                        {tracking === "DELIVERED" ? (
                            <p className="text-[11px] text-white/55" data-testid="seller-delivered-note">
                                Delivered {shipping.delivered_at ? timeAgo(shipping.delivered_at) : ""} — the buyer is
                                reviewing the order.
                            </p>
                        ) : (
                            <TrackingButtons sale={{ id: auction.id, shipping }} refetch={refresh} />
                        )}
                    </div>
                )}
            </RoleSection>

            <RoleSection icon={MapPin} title="Settlement" testid="seller-section-settlement">
                {onchainSettled ? (
                    <p className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] px-3 py-1 text-[11px] font-semibold text-[hsl(var(--bz-green))]" data-testid="seller-settled-note">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Settlement complete
                    </p>
                ) : escrowStatus === "RELEASED" ? (
                    <div className="space-y-2">
                        <p className="text-sm text-white/85" data-testid="seller-settlement-ready">
                            Settlement ready — the buyer confirmed receipt.
                        </p>
                        {settleReady && (
                            <button
                                type="button"
                                data-testid="settle-onchain"
                                disabled={busy}
                                onClick={settle}
                                className="inline-flex items-center gap-2 rounded-full bz-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                            >
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                                Settle on-chain
                            </button>
                        )}
                        {txHash && (
                            <a
                                href={toExplorerTx(txHash)}
                                target="_blank"
                                rel="noreferrer"
                                data-testid="settle-tx-link"
                                className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
                            >
                                <ExternalLink className="h-3 w-3" />
                                View on {MONAD.networkName}
                            </a>
                        )}
                    </div>
                ) : escrowStatus === "REFUNDED" ? (
                    <p className="text-[11px] text-white/55" data-testid="seller-refunded-note">
                        Escrow refunded to the buyer.
                    </p>
                ) : (
                    <p className="text-sm text-white/75" data-testid="seller-settlement-status">
                        {tracking === "DELIVERED"
                            ? "Delivered — waiting for buyer confirmation (48h window)."
                            : "Waiting for buyer confirmation."}
                    </p>
                )}
            </RoleSection>
        </div>
    );
}
