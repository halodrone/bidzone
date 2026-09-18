import { Gavel, LogIn, LockKeyhole, TimerOff } from "lucide-react";
import { toast } from "sonner";
import { fmtAmount } from "@/components/auction/format";
import { useMinimumNextBid } from "@/hooks/useAuctionRoom";

export function BiddingPanel({ auction }) {
    const minNext = useMinimumNextBid(auction);
    if (!auction) return null;

    const isLive = auction.status === "LIVE";
    const hasCurrent = Boolean(auction.current_bid);

    return (
        <aside
            data-testid="auction-bidding-panel"
            className="bz-card p-5 md:p-6"
        >
            <div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                    {hasCurrent ? "Current Bid" : "Starting Bid"}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                    <span
                        data-testid="auction-current-bid"
                        className="font-display text-4xl font-bold tabular-nums md:text-5xl"
                    >
                        {fmtAmount(auction.current_bid ?? auction.starting_bid)}
                    </span>
                    <span className="text-sm font-medium text-white/50 tracking-widest">
                        MON
                    </span>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-4">
                <Stat
                    label="Minimum Next Bid"
                    value={fmtAmount(minNext)}
                    testId="auction-min-next-bid"
                />
                <Stat
                    label="Increment"
                    value={fmtAmount(auction.minimum_increment)}
                    testId="auction-min-increment"
                />
            </div>

            <BidCTA isLive={isLive} status={auction.status} />

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/45">
                <LockKeyhole className="h-3 w-3 text-[hsl(var(--bz-purple))]" />
                Transparent auction. No hidden reserve. No buyer premium.
            </p>
        </aside>
    );
}

function BidCTA({ isLive, status }) {
    if (status === "ENDED" || status === "CANCELLED") {
        return (
            <button
                type="button"
                disabled
                data-testid="auction-bid-cta"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-secondary px-5 py-3.5 text-sm font-semibold opacity-70 cursor-not-allowed"
            >
                <TimerOff className="h-4 w-4" />
                Auction {status === "ENDED" ? "Ended" : "Cancelled"}
            </button>
        );
    }
    if (!isLive) {
        return (
            <button
                type="button"
                disabled
                data-testid="auction-bid-cta"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-secondary px-5 py-3.5 text-sm font-semibold opacity-70 cursor-not-allowed"
            >
                Not open for bidding
            </button>
        );
    }
    return (
        <button
            type="button"
            data-testid="auction-bid-cta"
            onClick={() =>
                toast("Sign in to place your bid", {
                    description:
                        "Bidding will unlock once the wallet integration is available.",
                })
            }
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-5 py-3.5 text-sm font-semibold"
        >
            <Gavel className="h-4 w-4" />
            <span>Sign In to Bid</span>
            <LogIn className="h-4 w-4 opacity-70" />
        </button>
    );
}

function Stat({ label, value, testId }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">
                {label}
            </div>
            <div
                data-testid={testId}
                className="font-display text-lg font-semibold tabular-nums"
            >
                {value}
                <span className="ml-1 text-[10px] font-medium text-white/45 tracking-widest">
                    MON
                </span>
            </div>
        </div>
    );
}
