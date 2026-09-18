import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gavel, LogIn, LockKeyhole, TimerOff, Wallet as WalletIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtAmount } from "@/components/auction/format";
import { useMinimumNextBid, compareDecimals, submitBid } from "@/hooks/useAuctionRoom";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";

/**
 * Phase 6.4 — real application-level bidding.
 * Server stays authoritative (tg_validate_bid / tg_after_bid_insert):
 * LIVE window, seller self-bid prevention, minimum increment, current_bid
 * update, anti-sniping (+10s) and outbid/won notifications are all enforced
 * inside the database. Client validation only pre-filters honest mistakes.
 * NO blockchain transaction happens in this phase — bids are application
 * records, clearly labeled.
 */
export function BiddingPanel({ auction }) {
    const minNext = useMinimumNextBid(auction);
    const { session, profile } = useAuth();
    const { status: walletStatus } = useWallet();
    if (!auction) return null;

    const isLive = auction.status === "LIVE";
    const hasCurrent = Boolean(auction.current_bid);
    const isAuthed = Boolean(session);
    const isSeller =
        isAuthed && profile && auction.seller && profile.id === auction.seller.id;

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

            {isLive && isAuthed && !isSeller && (
                <BidForm auction={auction} minNext={minNext} walletStatus={walletStatus} />
            )}
            {isLive && isSeller && (
                <div
                    data-testid="auction-owner-note"
                    className="mt-5 rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3 text-xs text-white/55"
                >
                    This is your auction — sellers cannot bid on their own listings.
                </div>
            )}
            {!isLive && isAuthed && !isSeller && <BidCTA isLive={isLive} status={auction.status} />}
            {!isAuthed && <BidCTA isLive={isLive} status={auction.status} />}

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/45">
                <LockKeyhole className="h-3 w-3 text-[hsl(var(--bz-purple))]" />
                Transparent auction. No hidden reserve. No buyer premium.
            </p>
        </aside>
    );
}

function walletHint(walletStatus) {
    if (walletStatus === "unavailable") {
        return "Wallet pending — bids are application-level until the embedded wallet connects (Phase 6.5).";
    }
    if (walletStatus === "provisioning") {
        return "Setting up your embedded wallet…";
    }
    if (walletStatus === "error") {
        return "Wallet setup failed — bidding continues at application level.";
    }
    return "Application-level bid — onchain escrow activates in Phase 6.5.";
}

function BidForm({ auction, minNext, walletStatus }) {
    const { session, profile } = useAuth();
    const qc = useQueryClient();
    const [amount, setAmount] = useState(() => (minNext ? String(minNext) : ""));
    const [submitting, setSubmitting] = useState(false);

    async function placeBid() {
        if (submitting) return;
        const value = String(amount || "").trim();
        if (!value || isNaN(Number(value)) || Number(value) <= 0) {
            toast.error("Enter a valid bid amount");
            return;
        }
        if (minNext && compareDecimals(value, minNext) < 0) {
            toast.error("Bid below minimum", {
                description: `Minimum next bid is ${fmtAmount(minNext)} MON.`,
            });
            return;
        }
        setSubmitting(true);
        try {
            await submitBid({
                auctionId: auction.id,
                bidderId: session.user.id,
                amount: value,
                walletAddress: profile ? profile.wallet_address : null,
            });
            toast.success(`Bid placed — ${fmtAmount(value)} MON`, {
                description: "Application-level bid. Onchain escrow arrives in Phase 6.5.",
            });
            setAmount("");
            qc.invalidateQueries({ queryKey: ["auction", auction.id] });
            qc.invalidateQueries({ queryKey: ["auction-bids", auction.id] });
        } catch (e) {
            toast.error("Bid rejected", {
                description: (e && e.message) || "The auction did not accept this bid.",
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="mt-5" data-testid="bid-form">
            <div
                data-testid="bid-wallet-note"
                className="mb-3 flex items-start gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] text-white/55"
            >
                <WalletIcon className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--bz-purple))]" />
                {walletHint(walletStatus)}
            </div>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <input
                        data-testid="bid-amount-input"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder={minNext ? String(minNext) : "0.00"}
                        disabled={submitting}
                        className="bz-input w-full pr-12 tabular-nums"
                        aria-label="Your bid amount in MON"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium tracking-widest text-white/40">
                        MON
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="bid-submit"
                    onClick={placeBid}
                    disabled={submitting}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bz-btn-primary px-5 text-sm font-semibold disabled:opacity-60"
                >
                    {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Gavel className="h-4 w-4" />
                    )}
                    Place Bid
                </button>
            </div>
        </div>
    );
}

function BidCTA({ isLive, status }) {
    const auth = useAuth();
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
            onClick={() => {
                const { isAuthed, openAuthModal } = auth;
                if (!isAuthed) {
                    openAuthModal({ returnTo: window.location.pathname });
                    return;
                }
                toast("Bidding unlocks with wallet integration", {
                    description:
                        "Bidding will unlock once the wallet integration is available.",
                });
            }}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-5 py-3.5 text-sm font-semibold"
        >
            <Gavel className="h-4 w-4" />
            <span>{auth.isAuthed ? "Place Bid" : "Sign In to Bid"}</span>
            {!auth.isAuthed && <LogIn className="h-4 w-4 opacity-70" />}
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
