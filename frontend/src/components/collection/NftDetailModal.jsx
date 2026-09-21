import { useEffect, useState } from "react";
import { X, Loader2, ExternalLink, Gavel, Send, Package, ShieldCheck, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { MONAD } from "@/lib/monad";
import { shortAddr, fmtAmount } from "@/components/auction/format";
import { readNftListing, readEscrowStatus, escrowStatusLabel, cancelNftAuctionOnchain, NFT_ESCROW_ADDRESS } from "@/lib/nft";

/**
 * BIDZONE Phase 7.2 FINAL (Model B) — NFT DETAIL.
 * Full on-chain-verified asset view: metadata, status, and the two asset
 * actions (AUCTION THIS NFT / SEND TO EXTERNAL WALLET). IN AUCTION / IN
 * ESCROW disables both with a clear explanation — no fake states.
 */
export function NftDetailModal({ open, onClose, asset, myWallet }) {
    const qc = useQueryClient();
    const [reclaiming, setReclaiming] = useState(false);
    const [txHash, setTxHash] = useState(null);

    if (!open || !asset) return null;

    const { nftContract, tokenId, meta, owner, escrowStatus, listing, activeAuctionId } = asset;
    const status = asset.status; // AVAILABLE | IN_AUCTION | IN_ESCROW
    const isSeller = listing && String(listing.seller).toLowerCase() === String(myWallet || "").toLowerCase();

    async function reclaim() {
        if (reclaiming) return;
        setReclaiming(true);
        try {
            const res = await cancelNftAuctionOnchain({ wallet: asset.wallet, nftContract, tokenId });
            setTxHash(res.hash);
            toast.success("Listing cancelled — NFT reclaimed");
            qc.invalidateQueries({ queryKey: ["my-collection"] });
            qc.invalidateQueries({ queryKey: ["nft-asset"] });
        } catch (e) {
            toast.error("Reclaim failed", { description: (e && (e.shortMessage || e.message)) || "Try again." });
        } finally {
            setReclaiming(false);
        }
    }

    const statusChip = {
        AVAILABLE: "border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)]",
        IN_AUCTION: "border-[hsl(var(--bz-purple)/0.5)] bg-[hsl(var(--bz-purple)/0.12)]",
        IN_ESCROW: "border-amber-400/50 bg-amber-400/10",
    }[status] || "border-white/15 bg-white/[0.04]";

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6" data-testid="nft-detail-modal" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative max-h-full w-full max-w-lg overflow-y-auto rounded-3xl bz-card p-6">
                <button type="button" onClick={onClose} aria-label="Close" data-testid="nft-detail-close" className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 hover:text-white">
                    <X className="h-4 w-4" />
                </button>

                {/* Image */}
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/40">
                    {meta?.image ? (
                        <img src={meta.image} alt={meta?.name || `Token #${tokenId}`} className="aspect-square w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[hsl(var(--bz-purple)/0.25)] to-transparent">
                            <Package className="h-14 w-14 text-white/25" />
                        </div>
                    )}
                    <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold text-white ${statusChip}`} data-testid="nft-detail-status">
                        {status === "AVAILABLE" ? "AVAILABLE" : status === "IN_AUCTION" ? "IN AUCTION" : "IN ESCROW"}
                    </span>
                </div>

                <h3 className="mt-4 font-display text-xl font-bold text-white" data-testid="nft-detail-name">{meta?.name || `Token #${tokenId}`}</h3>
                <p className="text-xs text-white/45" data-testid="nft-detail-collection">{meta?.collectionName || "Unidentified collection"} · #{tokenId}</p>

                {meta?.description && <p className="mt-3 text-xs leading-relaxed text-white/70" data-testid="nft-detail-description">{meta.description}</p>}

                {/* Traits / rarity */}
                {(meta?.attributes?.length > 0 || meta?.rarity) && (
                    <div className="mt-4 flex flex-wrap gap-1.5" data-testid="nft-detail-traits">
                        {meta?.rarity && (
                            <span className="rounded-full border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.1)] px-2.5 py-1 text-[10px] font-semibold text-white" data-testid="nft-detail-rarity">Rarity: {meta.rarity}</span>
                        )}
                        {(meta?.attributes || []).slice(0, 8).map((a, i) => (
                            <span key={`${a.trait_type}-${i}`} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/70">
                                {a.trait_type}: <span className="text-white">{a.value}</span>
                            </span>
                        ))}
                    </div>
                )}

                {/* Facts */}
                <dl className="mt-4 space-y-2 rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-xs" data-testid="nft-detail-facts">
                    <Fact label="Contract" value={shortAddr(nftContract)} href={`${MONAD.explorer.replace(/\/$/, "")}/address/${nftContract}`} testId="nft-detail-contract" />
                    <Fact label="Token ID" value={`#${tokenId}`} testId="nft-detail-token-id" />
                    <Fact label="Owner" value={owner ? shortAddr(owner) : "—"} testId="nft-detail-owner" />
                    <Fact label="Network" value={`${MONAD.network || "Monad"} · chain ${MONAD.chainId}`} testId="nft-detail-network" />
                    {listing && Number(listing.status) > 0 && (
                        <Fact label="Escrow" value={escrowStatusLabel(escrowStatus ?? listing.status)} testId="nft-detail-escrow" />
                    )}
                    {listing && Number(listing.status) === 1 && (
                        <Fact label="Current bid" value={`${fmtAmount(String(listing.currentBid || listing.startingBid))} MON`} testId="nft-detail-current-bid" />
                    )}
                </dl>

                {/* Actions */}
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {status === "AVAILABLE" ? (
                        <Link to={`/create?auctionNft=${nftContract}:${tokenId}`} data-testid="auction-nft-cta" className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-primary px-5 py-3 text-sm font-semibold">
                            <Gavel className="h-4 w-4" /> Auction This NFT
                        </Link>
                    ) : (
                        <button type="button" disabled data-testid="auction-nft-cta-disabled" title={status === "IN_AUCTION" ? "This NFT is in a live auction" : "This NFT is held by the escrow contract"} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/40">
                            <Gavel className="h-4 w-4" /> {status === "IN_AUCTION" ? "In live auction" : "In escrow"}
                        </button>
                    )}

                    {status === "AVAILABLE" ? (
                        <button type="button" onClick={() => asset.onSend && asset.onSend()} data-testid="send-nft-external-cta" className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-secondary px-5 py-3 text-sm font-semibold">
                            <Send className="h-4 w-4" /> Send to External Wallet
                        </button>
                    ) : (
                        <button type="button" disabled data-testid="send-nft-external-cta-disabled" title="Locked while the NFT is auctioned/escrowed" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/40">
                            <Send className="h-4 w-4" /> Locked while auctioned
                        </button>
                    )}
                </div>

                {activeAuctionId && (
                    <Link to={`/auction/${activeAuctionId}`} data-testid="nft-detail-auction-link" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/60 underline hover:text-white">
                        <Gavel className="h-3.5 w-3.5" /> Open auction room <ExternalLink className="h-3 w-3" />
                    </Link>
                )}

                {/* No-sale reclaim path (escrow holds it, no bids, sale over) */}
                {isSeller && owner && String(owner).toLowerCase() === String(NFT_ESCROW_ADDRESS || "").toLowerCase() && escrowStatus != null && escrowStatus !== 1 && escrowStatus !== 3 && (
                    <button type="button" onClick={reclaim} disabled={reclaiming} data-testid="nft-detail-reclaim" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-secondary px-5 py-2.5 text-xs font-semibold">
                        {reclaiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Reclaim NFT from escrow
                    </button>
                )}

                {txHash && (
                    <a href={`${MONAD.explorer.replace(/\/$/, "")}/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-white/60 hover:text-white" data-testid="nft-detail-tx">
                        tx {shortAddr(txHash)} <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>
        </div>
    );
}

function Fact({ label, value, href, testId }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-white/45">{label}</dt>
            <dd className="font-mono text-white/85" data-testid={testId}>
                {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{value} <ExternalLink className="h-3 w-3" /></a> : value}
            </dd>
        </div>
    );
}
