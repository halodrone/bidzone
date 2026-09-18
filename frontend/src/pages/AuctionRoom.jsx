import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
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
import { NotFound } from "@/components/auction/NotFound";
import { EndedState } from "@/components/auction/EndedState";
import {
    useAuction,
    useAuctionBids,
    useAuctionRealtime,
} from "@/hooks/useAuctionRoom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

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
