import { useParams } from "react-router-dom";
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
    useAuctionRealtime,
} from "@/hooks/useAuctionRoom";

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
                        {auction.status === "ENDED" && (
                            <div className="mb-8">
                                <EndedState auction={auction} />
                            </div>
                        )}

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
