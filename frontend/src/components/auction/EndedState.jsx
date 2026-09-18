import { Trophy, PackageOpen, Crown } from "lucide-react";
import { useAuctionBids } from "@/hooks/useAuctionRoom";
import { fmtAmount, shortAddr, timeAgo } from "@/components/auction/format";

/**
 * Ended-state banner. Only renders when auction.status === 'ENDED'.
 * A winner is shown only when the WINNING bid actually exists in the
 * database — never inferred client-side.
 */
export function EndedState({ auction }) {
    const { data } = useAuctionBids(auction.id, { limit: 5 });
    const winning = (data?.rows ?? []).find((b) => b.status === "WINNING");

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
                        Awaiting settlement. The winning bidder proceeds to escrow.
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
                        Settlement (2.5% platform / 97.5% seller) will complete once the
                        Monad escrow layer is live.
                    </p>
                </div>
            </div>
        </section>
    );
}
