import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gavel, LogIn, LockKeyhole, TimerOff, Wallet as WalletIcon, Loader2, ExternalLink, Coins, MapPin } from "lucide-react";
import { toast } from "sonner";
import { fmtAmount } from "@/components/auction/format";
import { useMinimumNextBid, compareDecimals, submitBid } from "@/hooks/useAuctionRoom";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { useMyAddresses } from "@/lib/shipping";
import { AddressModal } from "@/components/auction/AddressModal";
import {
    isOnchainAvailable,
    placeBidOnchain,
    withdrawRefundOnchain,
    readRefund,
    toExplorerTx,
    fromWei,
} from "@/lib/bidzoneAuction";
import { isNftAvailable, placeBidNftOnchain } from "@/lib/nft";
import { MONAD } from "@/lib/monad";

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
    const { status: walletStatus, privyWallet, address: walletAddress } = useWallet();
    if (!auction) return null;

    const isLive = auction.status === "LIVE";
    const hasCurrent = Boolean(auction.current_bid);
    const isAuthed = Boolean(session);
    const isSeller =
        isAuthed && profile && auction.seller && profile.id === auction.seller.id;
    // Phase 6.5b pre-bid guard: when the on-chain path is configured but the
    // auction is NOT registered on-chain (contract_auction_id NULL), bidding
    // is locked — the user must never reach a raw BZ:not_found revert. The
    // owner gets the "Register On-Chain" recovery bar (AuctionRoom).
    const onchainPending = isOnchainAvailable() && !auction.contract_auction_id;

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

            {isLive && isAuthed && !isSeller && onchainPending && (
                <div
                    data-testid="bid-onchain-pending-note"
                    className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200"
                >
                    This auction is not yet registered on-chain. Bidding unlocks once the
                    seller completes on-chain registration.
                </div>
            )}
            {isLive && isAuthed && !isSeller && !onchainPending && (
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

            {/* Refunds exist exactly when the auction is OVER (outbid escrow is
                claimable after being outbid / settlement), so the panel must
                render OUTSIDE the LIVE-only BidForm — previously losing bidders
                on ENDED auctions could never withdraw. Self-guarded: renders
                only when the on-chain path is on, the wallet is ready, and
                refundOf > 0 for this wallet. */}
            {!isLive && isAuthed && !isSeller && (
                <RefundPanel
                    auctionUuid={auction.id}
                    walletAddress={walletAddress}
                    onchainOn={isOnchainAvailable() && walletStatus === "ready"}
                    privyWallet={privyWallet}
                />
            )}

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/45">
                <LockKeyhole className="h-3 w-3 text-[hsl(var(--bz-purple))]" />
                Transparent auction. No hidden reserve. No buyer premium.
            </p>
        </aside>
    );
}

function walletHint(walletStatus, onchainOn) {
    if (walletStatus === "unavailable") {
        return onchainOn
            ? "Wallet unavailable — sign in and provision your embedded wallet to bid on-chain."
            : "Wallet pending — bids are application-level until the embedded wallet connects (Phase 6.5).";
    }
    if (walletStatus === "provisioning") return "Setting up your embedded wallet…";
    if (walletStatus === "error") return "Wallet setup failed — bidding paused.";
    return onchainOn
        ? "On-chain bid — your MON is escrowed by the BIDZONE contract until settlement."
        : "Application-level bid — onchain escrow activates in Phase 6.5.";
}

function BidForm({ auction, minNext, walletStatus }) {
    const { session, profile } = useAuth();
    const { privyWallet, address: walletAddress, refreshBalance } = useWallet();
    const qc = useQueryClient();
    const [amount, setAmount] = useState(() => (minNext ? String(minNext) : ""));
    const [phase, setPhase] = useState("idle"); // idle | signing | pending | confirmed
    const [lastTxHash, setLastTxHash] = useState(null);
    const [addrModalOpen, setAddrModalOpen] = useState(false);
    const submitting = phase !== "idle" && phase !== "confirmed";
    const onchainOn = isOnchainAvailable();
    const canOnchain = onchainOn && walletStatus === "ready" && privyWallet;
    // Phase 7 — PHYSICAL auctions require the buyer to own a shipping
    // address BEFORE bidding (existence only; the DB trigger
    // tg_require_physical_address enforces the same rule server-side).
    const isPhysical = auction.auction_type === "PHYSICAL";
    const { data: myAddresses } = useMyAddresses();
    const hasAddress = (myAddresses?.length ?? 0) > 0;

    async function placeBid() {
        if (submitting) return;
        if (isPhysical && !hasAddress) {
            toast.error("Add a shipping address before bidding on physical items.", {
                description: "Your address stays private — only the seller of an order you win ever sees it.",
            });
            setAddrModalOpen(true);
            return;
        }
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

        // On-chain path: contract configured AND wallet ready.
        if (auction.auction_type === "NFT" && isNftAvailable()) {
            if (!canOnchain) {
                toast.error("Embedded wallet not ready", {
                    description: "Open Wallet and make sure your embedded wallet is ready to sign.",
                });
                return;
            }
            const nftToken = Array.isArray(auction.nft_tokens) ? auction.nft_tokens[0] : auction.nft_tokens;
            const tokenId = nftToken?.token_id;
            const nftContract = nftToken?.nft_contract;
            if (!tokenId || !nftContract) {
                toast.error("NFT not linked to this auction", {
                    description: "This NFT auction has no on-chain token record — it cannot accept bids.",
                });
                return;
            }
            let txHash = null;
            try {
                setPhase("signing");
                const { hash, receipt } = await placeBidNftOnchain({
                    wallet: privyWallet,
                    nftContract,
                    tokenId,
                    bidMon: value,
                });
                txHash = hash;
                setLastTxHash(hash);
                if (receipt.status !== "success") throw new Error("Transaction failed on-chain");
                setPhase("pending");
                await submitBid({
                    auctionId: auction.id,
                    bidderId: session.user.id,
                    amount: value,
                    walletAddress: walletAddress || (profile ? profile.wallet_address : null),
                    transactionHash: hash,
                });
                setPhase("confirmed");
                toast.success(`On-chain bid confirmed — ${fmtAmount(value)} MON`, {
                    description: "NFT escrowed by BidzoneNFTEscrow until settlement.",
                });
                setAmount("");
                refreshBalance();
                qc.invalidateQueries({ queryKey: ["auction", auction.id] });
                qc.invalidateQueries({ queryKey: ["auction-bids", auction.id] });
            } catch (e) {
                setPhase("idle");
                const msg = (e && (e.shortMessage || e.message)) || "Bid failed";
                toast.error("Bid rejected", {
                    description: txHash ? "On-chain call reverted or DB write failed." : msg,
                });
            }
            return;
        }

        if (canOnchain) {
            let txHash = null;
            try {
                setPhase("signing");
                const { hash, receipt } = await placeBidOnchain({
                    wallet: privyWallet,
                    uuid: auction.id,
                    bidMon: value,
                });
                txHash = hash;
                setLastTxHash(hash);
                if (receipt.status !== "success") throw new Error("Transaction failed on-chain");
                setPhase("pending");

                // Mirror the confirmed bid off-chain (server triggers still enforce rules).
                await submitBid({
                    auctionId: auction.id,
                    bidderId: session.user.id,
                    amount: value,
                    walletAddress: walletAddress || (profile ? profile.wallet_address : null),
                    transactionHash: hash,
                });
                setPhase("confirmed");
                toast.success(`On-chain bid confirmed — ${fmtAmount(value)} MON`, {
                    description: "Escrow held by BIDZONE contract until settlement.",
                });
                setAmount("");
                refreshBalance();
                qc.invalidateQueries({ queryKey: ["auction", auction.id] });
                qc.invalidateQueries({ queryKey: ["auction-bids", auction.id] });
            } catch (e) {
                setPhase("idle");
                const msg = (e && (e.shortMessage || e.message)) || "Bid failed";
                toast.error("Bid rejected", {
                    description: txHash ? "On-chain call reverted or DB write failed." : msg,
                });
            }
            return;
        }

        // Fallback: application-level bid (Phase 6.4).
        setPhase("pending");
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
            setPhase("idle");
            qc.invalidateQueries({ queryKey: ["auction", auction.id] });
            qc.invalidateQueries({ queryKey: ["auction-bids", auction.id] });
        } catch (e) {
            setPhase("idle");
            toast.error("Bid rejected", {
                description: (e && e.message) || "The auction did not accept this bid.",
            });
        }
    }

    return (
        <div className="mt-5" data-testid="bid-form">
            <div
                data-testid="bid-wallet-note"
                className="mb-3 flex items-start gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] text-white/55"
            >
                <WalletIcon className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--bz-purple))]" />
                {walletHint(walletStatus, onchainOn)}
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
                {isPhysical && (
                    <button
                        type="button"
                        data-testid="bid-add-address"
                        onClick={() => setAddrModalOpen(true)}
                        title={hasAddress ? "Manage your shipping address" : "Add the shipping address required to bid"}
                        className={
                            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition " +
                            (hasAddress
                                ? "bz-btn-secondary"
                                : "border border-[hsl(var(--bz-purple)/0.6)] bg-[hsl(var(--bz-purple)/0.14)] text-white")
                        }
                    >
                        <MapPin className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                        {hasAddress ? "Address ✓" : "Add Address"}
                    </button>
                )}
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
                    {phase === "signing" && "Awaiting signature…"}
                    {phase === "pending" && "Confirming…"}
                    {phase !== "signing" && phase !== "pending" && "Place Bid"}
                </button>
            </div>
            {isPhysical && (
                <p
                    data-testid="bid-physical-note"
                    className="mt-2 flex items-start gap-1.5 text-[11px] text-white/50"
                >
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--bz-purple))]" />
                    {hasAddress
                        ? "Physical item — your saved shipping address will be used only if you win."
                        : "Physical item — add a shipping address to enable bidding."}
                </p>
            )}
            {lastTxHash && (
                <a
                    href={toExplorerTx(lastTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="bid-tx-link"
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-white/55 hover:text-white"
                >
                    <ExternalLink className="h-3 w-3" />
                    View last transaction on {MONAD.networkName}
                </a>
            )}
            <AddressModal
                open={addrModalOpen}
                onClose={() => setAddrModalOpen(false)}
            />
            <RefundPanel auctionUuid={auction.id} walletAddress={walletAddress} onchainOn={onchainOn && walletStatus === "ready"} privyWallet={privyWallet} />
        </div>
    );
}

/**
 * Pull-based refund UI — surfaces when the current signed-in wallet has an
 * unclaimed refund in the BIDZONE contract for this auction. Nothing shown
 * on-chain when no refund is queued.
 */
function RefundPanel({ auctionUuid, walletAddress, onchainOn, privyWallet }) {
    const [refund, setRefund] = useState(null);
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState(null);

    useEffect(() => {
        let cancelled = false;
        if (!onchainOn || !walletAddress) {
            setRefund(null);
            return () => {};
        }
        (async () => {
            try {
                const r = await readRefund(auctionUuid, walletAddress);
                if (!cancelled) setRefund(r);
            } catch {
                if (!cancelled) setRefund(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [auctionUuid, walletAddress, onchainOn, txHash]);

    if (!onchainOn || !refund || refund === 0n) return null;

    async function claim() {
        setBusy(true);
        try {
            const { hash } = await withdrawRefundOnchain({ wallet: privyWallet, uuid: auctionUuid });
            setTxHash(hash);
            toast.success("Refund withdrawn", { description: `${fromWei(refund)} MON returned to your wallet.` });
        } catch (e) {
            toast.error("Refund failed", { description: (e && (e.shortMessage || e.message)) || "See wallet response." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            data-testid="refund-panel"
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--bz-purple))]/40 bg-black/40 px-3 py-2"
        >
            <div className="text-[11px] text-white/70 flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                Refund available: <span className="font-semibold text-white">{fromWei(refund)} MON</span>
            </div>
            <button
                type="button"
                data-testid="refund-withdraw"
                disabled={busy}
                onClick={claim}
                className="inline-flex items-center gap-1.5 rounded-full bz-btn-secondary px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Withdraw
            </button>
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
