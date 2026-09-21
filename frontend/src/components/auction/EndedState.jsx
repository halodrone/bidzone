import { useEffect, useState } from "react";
import { Trophy, PackageOpen, Crown, Loader2, ExternalLink, CheckCircle2, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuctionBids } from "@/hooks/useAuctionRoom";
import { fmtAmount, shortAddr, timeAgo } from "@/components/auction/format";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/context/AuthContext";
import { isOnchainAvailable, settleAuctionOnchain, toExplorerTx } from "@/lib/bidzoneAuction";
import { isNftAvailable, settleNftAuctionOnchain, readEscrowStatus } from "@/lib/nft";
import { recordNftEvent } from "@/lib/nftIndex";
import { trackingLabel } from "@/lib/shipping";
import { supabase } from "@/lib/supabase";
import { MONAD } from "@/lib/monad";

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
            <div className="relative flex items-start gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--bz-purple)/0.55)] bg-[hsl(var(--bz-purple)/0.14)]">
                    <Trophy className="h-5 w-5 text-[hsl(var(--bz-purple))]" />
                </span>
                <div className="flex-1">
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
                    <p className="mt-4 text-[11px] text-white/40">
                        Settlement pays 97.5% to the seller and 2.5% to the BIDZONE treasury.
                    </p>
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
 */
function useAuctionEscrowState(auctionId) {
    const [state, setState] = useState({ loading: true, escrow: null, shipping: null });
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!supabase) {
                if (!cancelled) setState({ loading: false, escrow: null, shipping: null });
                return;
            }
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
                        .select("carrier,tracking_number,tracking_status,shipped_at,delivered_at")
                        .eq("auction_id", auctionId)
                        .maybeSingle(),
                ]);
                if (!cancelled) setState({ loading: false, escrow: esc.data || null, shipping: shp.data || null });
            } catch {
                if (!cancelled) setState({ loading: false, escrow: null, shipping: null });
            }
        })();
        return () => { cancelled = true; };
    }, [auctionId]);
    return state;
}

/**
 * Phase 7.3 — PHYSICAL post-win experience, ROLE-GATED (buyer protection).
 *
 * Investigation result: the contract `settleAuction` pays 97.5% seller +
 * 2.5% treasury IMMEDIATELY from the escrowed winning bid — the contract has
 * no notion of the physical fulfillment lifecycle (ship -> deliver ->
 * confirm/dispute -> release). Buyer protection is therefore APP-LEVEL:
 *   * BUYER  — payment-secured + shipping lifecycle + tracking info.
 *              NEVER any settlement control.
 *   * SELLER — settlement status; the on-chain "Settle on-chain" control is
 *              only surfaced AFTER the DB escrow reached RELEASED (buyer
 *              confirmation / 48h auto-release / dispute resolved for seller).
 *   * Others — nothing (the old UI leaked a settle button to every viewer).
 *
 * The NFT flow (SettleNftAction) and the DIGITAL flow (SettleAction) are
 * unchanged.
 */
function PhysicalSettlement({ auction, winning }) {
    const { user } = useAuth();
    const { privyWallet, status: walletStatus } = useWallet();
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const { loading, escrow, shipping } = useAuctionEscrowState(auction.id);

    const uid = user?.id;
    const isSeller = !!uid && auction.seller?.id === uid;
    const isBuyer = !!uid && winning.bidder_id === uid;

    // Third parties (and unknown parties) get NO settlement surface.
    if (!isSeller && !isBuyer) return null;
    if (loading) return null;

    const escrowStatus = escrow?.status || null;

    // ---------------- BUYER: payment + shipping lifecycle only ----------------
    if (isBuyer) {
        return (
            <div className="mt-4 space-y-2" data-testid="physical-buyer-panel">
                {(escrowStatus === "FUNDED" || escrowStatus === "RELEASED") && (
                    <p
                        className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] px-3 py-1 text-[11px] font-semibold text-[hsl(var(--bz-green))]"
                        data-testid="buyer-payment-secured"
                    >
                        <ShieldCheck className="h-3.5 w-3.5" /> Payment secured in escrow
                    </p>
                )}
                {escrowStatus === "FUNDED" && (
                    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm" data-testid="buyer-shipping-status">
                        <p className="flex items-center gap-2 text-white/85">
                            <Truck className="h-4 w-4 text-[hsl(var(--bz-purple))]" />
                            {shipping ? trackingLabel(shipping.tracking_status) : "Awaiting seller shipment"}
                        </p>
                        {shipping?.carrier && shipping?.tracking_number && (
                            <p className="mt-1.5 rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/70" data-testid="buyer-tracking-info">
                                {shipping.carrier} · <span className="font-mono text-white">{shipping.tracking_number}</span>
                                {shipping.shipped_at ? ` · shipped ${timeAgo(shipping.shipped_at)}` : ""}
                            </p>
                        )}
                        {shipping?.tracking_status === "DELIVERED" && (
                            <p className="mt-1.5 text-[11px] text-white/55">
                                Confirm receipt or open a dispute in My Activity → Purchases (48h window).
                            </p>
                        )}
                    </div>
                )}
                {escrowStatus === "RELEASED" && (
                    <p className="text-[11px] text-white/55" data-testid="buyer-released-note">
                        Completed — funds released to the seller after your confirmation.
                    </p>
                )}
                {escrowStatus === "REFUNDED" && (
                    <p className="text-[11px] text-white/55" data-testid="buyer-refunded-note">
                        Escrow refunded — the seller failed to ship in time or the dispute favored you.
                    </p>
                )}
            </div>
        );
    }

    // ---------------- SELLER: settlement status + gated release ----------------
    const settleReady =
        escrowStatus === "RELEASED" &&
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
        <div className="mt-4 space-y-2" data-testid="physical-seller-panel">
            {escrowStatus === "PENDING" && (
                <p className="text-[11px] text-white/55" data-testid="seller-settlement-status">
                    Awaiting buyer payment confirmation.
                </p>
            )}
            {escrowStatus === "FUNDED" && (
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm" data-testid="seller-settlement-status">
                    <p className="text-white/85">
                        Buyer protection active — settlement unlocks after delivery is confirmed (or the 48h window closes).
                    </p>
                    {shipping ? (
                        <p className="mt-1.5 text-[11px] text-white/60">
                            Shipment: {trackingLabel(shipping.tracking_status)}
                            {shipping.carrier ? ` · ${shipping.carrier}` : ""}
                            {shipping.tracking_number ? ` · ${shipping.tracking_number}` : ""}
                        </p>
                    ) : (
                        <p className="mt-1.5 text-[11px] text-white/60">
                            Ship within 72 hours — add carrier and tracking in My Activity → Sales.
                        </p>
                    )}
                </div>
            )}
            {escrowStatus === "RELEASED" && !txHash && settleReady && (
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
            {escrowStatus === "RELEASED" && txHash && (
                <a
                    href={toExplorerTx(txHash)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="settle-tx-link"
                    className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
                >
                    <ExternalLink className="h-3 w-3" />
                    Settlement complete — view on {MONAD.networkName}
                </a>
            )}
        </div>
    );
}
