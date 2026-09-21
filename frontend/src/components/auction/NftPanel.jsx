import { useEffect, useState } from "react";
import { ExternalLink, Package, ShieldCheck } from "lucide-react";
import { MONAD } from "@/lib/monad";
import { NFT_CONTRACT_ADDRESS, NFT_ESCROW_ADDRESS, readNftListing, readNftOwner, escrowStatusLabel } from "@/lib/nft";
import { shortAddr, fmtAmount } from "@/components/auction/format";

/**
 * BIDZONE Phase 7.2 — NFT panel for the Auction Room.
 * ON-CHAIN TRUTH: ownership (ownerOf) + escrow status (BidzoneNFTEscrow
 * listing) are read from Monad Testnet every render — a Supabase row is
 * never treated as proof of ownership.
 */
export function NftPanel({ auction }) {
    const token = Array.isArray(auction.nft_tokens) ? auction.nft_tokens[0] : auction.nft_tokens;
    // Model B: the token row carries ITS OWN nft_contract (any ERC-721) —
    // the BIDZONE BidzoneNFT address is only the default/fallback.
    const nftContract = token?.nft_contract || NFT_CONTRACT_ADDRESS;
    const [onchain, setOnchain] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!token) return;
            try {
                const [owner, listing] = await Promise.all([
                    readNftOwner(nftContract, token.token_id),
                    readNftListing(nftContract, token.token_id),
                ]);
                if (!cancelled) setOnchain({ owner, listing });
            } catch {
                if (!cancelled) setOnchain({ owner: null, listing: null });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, nftContract]);

    if (!token) {
        return (
            <section className="bz-card p-5 md:p-6" data-testid="nft-panel-missing">
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                    <Package className="h-4 w-4 text-[hsl(var(--bz-purple))]" /> NFT
                </h3>
                <p className="mt-2 text-xs text-white/50">
                    No mint record is linked to this auction — bidding is disabled.
                </p>
            </section>
        );
    }

    const escrowAddr = (NFT_ESCROW_ADDRESS || "").toLowerCase();
    const owner = onchain?.owner ? String(onchain.owner).toLowerCase() : null;
    const inEscrow = owner === escrowAddr;
    const status = onchain?.listing ? escrowStatusLabel(onchain.listing.status) : null;

    return (
        <section className="bz-card p-5 md:p-6" data-testid="nft-panel">
            <header className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                    <Package className="h-4 w-4 text-[hsl(var(--bz-purple))]" /> NFT
                </h3>
                {status && (
                    <span className="inline-flex rounded-full border border-[hsl(var(--bz-purple)/0.5)] bg-[hsl(var(--bz-purple)/0.12)] px-2.5 py-1 text-[10px] font-semibold text-white">
                        Escrow: {status}
                    </span>
                )}
            </header>

            <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Collection</dt>
                    <dd className="truncate text-white/85" data-testid="nft-collection">{token.collection_name || "BIDZONE NFT"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Token</dt>
                    <dd className="text-white/85 tabular-nums" data-testid="nft-token-id">#{token.token_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Contract</dt>
                    <dd className="font-mono text-white/85">
                        <a
                            href={`${MONAD.explorer.replace(/\/$/, "")}/address/${nftContract}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                        >
                            {shortAddr(nftContract)} <ExternalLink className="h-3 w-3" />
                        </a>
                    </dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-white/45">On-chain owner</dt>
                    <dd className="font-mono" data-testid="nft-onchain-owner">
                        {onchain === null ? (
                            <span className="text-white/40">reading…</span>
                        ) : owner ? (
                            inEscrow ? (
                                <span className="text-[hsl(var(--bz-purple))]">Escrow contract</span>
                            ) : (
                                shortAddr(owner)
                            )
                        ) : (
                            <span className="text-white/40">unavailable</span>
                        )}
                    </dd>
                </div>
            </dl>

            {inEscrow && (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-black/25 px-3 py-2 text-[11px] text-white/60">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--bz-purple))]" />
                    Held by the BidzoneNFTEscrow contract — the seller cannot
                    move it while the auction is active.
                </p>
            )}
        </section>
    );
}
