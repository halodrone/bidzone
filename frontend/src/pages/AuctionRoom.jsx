import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Rocket, Link2, Loader2 } from "lucide-react";
import { Header } from "@/components/home/Header";
import { Footer } from "@/components/home/Footer";
import { StatusHeader } from "@/components/auction/StatusHeader";
import { MediaGallery } from "@/components/auction/MediaGallery";
import { BiddingPanel } from "@/components/auction/BiddingPanel";
import { AuctionInfo } from "@/components/auction/AuctionInfo";
import { BidHistory } from "@/components/auction/BidHistory";
import { PriceChart } from "@/components/auction/PriceChart";
import { ActivityFeed } from "@/components/auction/ActivityFeed";
import { CommentsPanel } from "@/components/auction/CommentsPanel";
import { ReactionsBar } from "@/components/auction/ReactionsBar";
import { NftPanel } from "@/components/auction/NftPanel";
import { NotFound } from "@/components/auction/NotFound";
import { EndedState } from "@/components/auction/EndedState";
import {
    useAuction,
    useAuctionBids,
    useAuctionRealtime,
} from "@/hooks/useAuctionRoom";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { supabase } from "@/lib/supabase";
import { isOnchainAvailable, toExplorerTx } from "@/lib/bidzoneAuction";
import { registerOrReconcileAuction } from "@/lib/auctionRegistration";

export default function AuctionRoom() {
    const { auctionId } = useParams();
    const { data: auction, isLoading, notFound } = useAuction(auctionId);
    useAuctionRealtime(auctionId);

    return (
        <div data-testid="page-auction-room" className="bz-ambient min-h-screen">
            <Header />
            {isLoading ? (
                <LoadingSkeleton />
            ) : notFound ? (
                <NotFound />
            ) : (
                <>
                    <StatusHeader auction={auction} />
                    <main className="mx-auto max-w-[1400px] px-4 md:px-8 pb-24 pt-6 md:pt-10">
                        {auction.status === "DRAFT" && <OwnerDraftBar auction={auction} />}
                        {auction.status === "LIVE" && (
                            <OwnerRegistrationBar auction={auction} />
                        )}
                        {auction.status === "ENDED" && (
                            <div className="mb-8">
                                <EndedState auction={auction} />
                            </div>
                        )}
                        <OutbidWatcher auctionId={auction.id} />

                        {/* Mobile priority-stack: order via CSS on md+ turns into 3-col grid */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                            {/* Media + chart + bids  (center on desktop) */}
                            <div className="order-1 flex flex-col gap-6 lg:order-2 lg:col-span-6">
                                <MediaGallery items={auction.auction_items} />
                                <PriceChart auctionId={auction.id} />
                                <BidHistory auctionId={auction.id} />
                            </div>

                            {/* Bidding + item info  (left on desktop) */}
                            <div className="order-2 flex flex-col gap-6 lg:order-1 lg:col-span-3">
                                <BiddingPanel auction={auction} />
                                {auction.auction_type === "NFT" && <NftPanel auction={auction} />}
                                <AuctionInfo auction={auction} />
                            </div>

                            {/* Social  (right on desktop) */}
                            <div className="order-3 flex flex-col gap-6 lg:col-span-3">
                                <ReactionsBar auctionId={auction.id} />
                                <ActivityFeed
                                    auctionId={auction.id}
                                    auctionStatus={auction.status}
                                />
                                <CommentsPanel auctionId={auction.id} />
                            </div>
                        </div>
                    </main>
                </>
            )}
            <Footer />
        </div>
    );
}

function OwnerDraftBar({ auction }) {
    const { profile } = useAuth();
    const qc = useQueryClient();
    const isOwner = Boolean(profile && auction.seller && profile.id === auction.seller.id);
    if (!isOwner) return null;

    async function publish() {
        const { error } = await supabase
            .from("auctions")
            .update({ status: "LIVE" })
            .eq("id", auction.id);
        if (error) {
            toast.error("Could not publish auction", { description: error.message });
            return;
        }
        toast.success("Auction is LIVE");
        qc.invalidateQueries({ queryKey: ["auction", auction.id] });
        qc.invalidateQueries({ queryKey: ["home-auctions"] });
    }

    return (
        <div
            data-testid="owner-draft-bar"
            className="mx-auto max-w-[1400px] px-4 md:px-8 pt-6"
        >
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-black/25 px-5 py-4">
                <div>
                    <div className="text-sm font-semibold">Draft — only you can see this</div>
                    <div className="text-[11px] text-white/50">
                        Publish to open bidding. This matches the Create Auction flow.
                    </div>
                </div>
                <button
                    type="button"
                    data-testid="owner-publish-cta"
                    onClick={publish}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bz-btn-primary px-5 py-2.5 text-sm font-semibold"
                >
                    <Rocket className="h-4 w-4" /> Publish auction
                </button>
            </div>
        </div>
    );
}

/**
 * Phase 6.5b — reliable on-chain registration / recovery.
 * Shows for the auction OWNER while the auction is LIVE but has NO on-chain
 * registration (contract_auction_id NULL). Guarantees: ownership + wallet +
 * contract checks; read-before-submit duplicate protection (the shared helper
 * reconciles instead of re-creating); Supabase updated ONLY after tx
 * confirmation; failures keep the auction recoverable — never fake success.
 */
function OwnerRegistrationBar({ auction }) {
    const { profile } = useAuth();
    const { privyWallet, status: walletStatus } = useWallet();
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const isOwner = Boolean(profile && auction.seller && profile.id === auction.seller.id);
    if (!isOwner || auction.contract_auction_id) return null;

    const walletReady = walletStatus === "ready" && Boolean(privyWallet);

    async function register() {
        if (busy) return;
        if (!isOnchainAvailable()) {
            toast.error("On-chain registration is not configured");
            return;
        }
        if (!walletReady) {
            toast.error("Embedded wallet is not ready", {
                description: "Wait for wallet provisioning to finish, then retry.",
            });
            return;
        }
        setBusy(true);
        try {
            const res = await registerOrReconcileAuction({ wallet: privyWallet, auction });
            if (res.reconciled) {
                toast.info("Auction was already registered on-chain", {
                    description: "Supabase state reconciled — no new transaction was needed.",
                });
            } else {
                toast.success("Auction registered on Monad Testnet", {
                    description: toExplorerTx(res.hash),
                });
            }
            qc.invalidateQueries({ queryKey: ["auction", auction.id] });
            qc.invalidateQueries({ queryKey: ["home-auctions"] });
        } catch (e) {
            toast.error("On-chain registration failed", {
                description: (e && (e.shortMessage || e.message)) ||
                    "The auction stays recoverable — retry any time.",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            data-testid="owner-registration-bar"
            className="mx-auto max-w-[1400px] px-4 md:px-8 pt-6"
        >
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-sm font-semibold text-amber-200">
                        On-chain registration pending
                    </div>
                    <div className="text-[11px] text-white/55">
                        This auction is live in BIDZONE but not yet registered on Monad Testnet —
                        bidding stays locked until it is registered.
                    </div>
                </div>
                <button
                    type="button"
                    data-testid="owner-register-onchain-cta"
                    onClick={register}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bz-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                    {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Link2 className="h-4 w-4" />
                    )}
                    {busy ? "Registering…" : "Register On-Chain"}
                </button>
            </div>
        </div>
    );
}

/**
 * Phase 6.4 — honest outbid toast. The database already records the OUTBID
 * notification (tg_after_bid_insert); here we surface it: when the previous
 * top bidder was the current user and the top bid changes to someone else,
 * toast once. Derives from refetched server rows — no fabricated events.
 */
function OutbidWatcher({ auctionId }) {
    const { data: bidsData } = useAuctionBids(auctionId, { limit: 5 });
    const { user } = useAuth();
    const prevWinner = useRef(null);

    useEffect(() => {
        const rows = bidsData?.rows || [];
        if (!rows.length) return undefined;
        const currentWinner = rows[0].bidder_id;
        if (
            prevWinner.current &&
            user &&
            prevWinner.current === user.id &&
            currentWinner !== user.id
        ) {
            toast.error("You've been outbid", {
                description: "Another bidder has taken the lead.",
            });
        }
        prevWinner.current = currentWinner;
        return undefined;
    }, [bidsData, user]);

    return null;
}

function LoadingSkeleton() {
    return (
        <div className="mx-auto max-w-[1400px] px-4 md:px-8 pt-10">
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 rounded-full bg-white/[0.05]" />
                <div className="h-10 w-3/4 max-w-xl rounded-full bg-white/[0.05]" />
                <div className="h-6 w-56 rounded-full bg-white/[0.05]" />
            </div>
            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-3 h-64 rounded-3xl bg-white/[0.03] animate-pulse" />
                <div className="lg:col-span-6 h-96 rounded-3xl bg-white/[0.03] animate-pulse" />
                <div className="lg:col-span-3 h-64 rounded-3xl bg-white/[0.03] animate-pulse" />
            </div>
        </div>
    );
}
