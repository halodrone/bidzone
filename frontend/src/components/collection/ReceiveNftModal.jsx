import { useState } from "react";
import { X, Loader2, ExternalLink, ArrowDownToLine, Wallet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { MONAD } from "@/lib/monad";
import { shortAddr } from "@/components/auction/format";
import { readNftOwner, readTokenURI, tokenExists, fetchNftMetadata, transferFromExternalWallet, hasInjectedWallet, normalizeAddress, sameAddr } from "@/lib/nft";
import { ensureNftTokenRow, recordNftEvent } from "@/lib/nftIndex";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";

/**
 * BIDZONE Phase 7.2 FINAL (Model B) — RECEIVE NFT (external → embedded).
 * The user provides (nftContract, tokenId); BIDZONE validates on-chain,
 * previews the asset, then the EXTERNAL wallet (MetaMask/injected EIP-1193)
 * signs safeTransferFrom to the embedded wallet. Nothing is claimed before
 * the transaction succeeds. No private keys, no seed phrases — ever.
 */
export function ReceiveNftModal({ open, onClose, myAddress }) {
    const qc = useQueryClient();
    const { session } = useAuth();
    const { address: embeddedAddress } = useWallet();
    const dest = embeddedAddress || myAddress;

    const [contract, setContract] = useState("");
    const [tokenId, setTokenId] = useState("");
    const [phase, setPhase] = useState("input"); // input | loading | preview | pending | success | failed
    const [asset, setAsset] = useState(null);
    const [err, setErr] = useState(null);
    const [txHash, setTxHash] = useState(null);

    if (!open) return null;

    const validAddr = /^0x[a-fA-F0-9]{40}$/.test(contract.trim());
    const validId = /^\d+$/.test(tokenId.trim());

    async function fetchAsset() {
        if (!validAddr || !validId || phase === "loading") return;
        setPhase("loading");
        setErr(null);
        try {
            const exists = await tokenExists(contract.trim(), tokenId.trim());
            if (!exists) throw new Error("This token does not exist on Monad Testnet (chain 10143)");
            const owner = await readNftOwner(contract.trim(), tokenId.trim());
            const meta = await fetchNftMetadata(contract.trim(), tokenId.trim());
            setAsset({ nftContract: normalizeAddress(contract.trim()), tokenId: tokenId.trim(), owner: String(owner), meta });
            setPhase("preview");
        } catch (e) {
            setErr((e && (e.shortMessage || e.message)) || "Could not read this NFT on-chain");
            setPhase("input");
        }
    }

    async function receive() {
        if (!asset || phase === "pending") return;
        if (!hasInjectedWallet()) {
            setErr("No external wallet found in this browser. Install an EVM wallet (e.g. MetaMask) connected to Monad Testnet (chain 10143) to send the NFT in.");
            return;
        }
        setPhase("pending");
        setErr(null);
        try {
            const res = await transferFromExternalWallet({
                nftContract: asset.nftContract,
                tokenId: asset.tokenId,
                fromAddress: asset.owner,
                toAddress: dest,
            });
            setTxHash(res.hash);
            // Index AFTER on-chain success (index, not truth).
            try {
                const { row } = await ensureNftTokenRow({
                    session,
                    nftContract: asset.nftContract,
                    tokenId: asset.tokenId,
                    tokenUri: asset.meta?.tokenUriRaw || "",
                    name: asset.meta?.name || undefined,
                    description: asset.meta?.description || null,
                    collectionName: asset.meta?.collectionName || undefined,
                    attributes: asset.meta?.attributes || [],
                    ownerWallet: dest,
                });
                if (row) await recordNftEvent({ session, tokenRowId: row.id, eventType: "TRANSFER", txHash: res.hash, toWallet: dest });
            } catch {
                /* index write is best-effort — chain state is authoritative */
            }
            setPhase("success");
            qc.invalidateQueries({ queryKey: ["my-collection"] });
            qc.invalidateQueries({ queryKey: ["nft-asset"] });
            toast.success("NFT received into your BIDZONE wallet");
        } catch (e) {
            setPhase("preview");
            setErr((e && (e.shortMessage || e.message)) || "The transfer did not complete — nothing was received.");
        }
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6" data-testid="receive-nft-modal" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative max-h-full w-full max-w-md overflow-y-auto rounded-3xl bz-card p-6">
                <button type="button" onClick={onClose} aria-label="Close" data-testid="receive-nft-close" className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 hover:text-white">
                    <X className="h-4 w-4" />
                </button>
                <h3 className="font-display text-lg font-bold text-white">Receive an NFT</h3>
                <p className="mt-1 text-xs text-white/50">
                    Bring an NFT you own on an external wallet into your BIDZONE embedded wallet. The external wallet signs the transfer — you pay its gas.
                </p>

                {phase === "input" || phase === "loading" ? (
                    <div className="mt-5 space-y-3">
                        <label className="block">
                            <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/50">NFT contract address</span>
                            <input className="bz-input w-full font-mono text-xs" data-testid="receive-nft-contract" value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0x… (ERC-721 contract)" maxLength={42} />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/50">Token ID</span>
                            <input className="bz-input w-full font-mono text-xs" data-testid="receive-nft-token-id" value={tokenId} onChange={(e) => setTokenId(e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 1" inputMode="numeric" />
                        </label>
                        <button type="button" onClick={fetchAsset} disabled={!validAddr || !validId || phase === "loading"} data-testid="receive-nft-fetch" className="inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-secondary px-5 py-3 text-sm font-semibold disabled:opacity-40">
                            {phase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />} Fetch NFT from chain
                        </button>
                        {err && <p className="rounded-xl border border-[hsl(var(--bz-red)/0.4)] bg-[hsl(var(--bz-red)/0.08)] p-3 text-xs text-white/80" data-testid="receive-nft-error"><AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />{err}</p>}
                    </div>
                ) : null}


                {(phase === "preview" || phase === "pending" || phase === "success") && asset && (
                    <div className="mt-5 space-y-3">
                        <div className="flex gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-3" data-testid="receive-nft-preview">
                            {asset.meta?.image ? (
                                <img src={asset.meta.image} alt="" className="h-20 w-20 rounded-xl border border-white/[0.06] object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-white/30"><Wallet className="h-6 w-6" /></div>
                            )}
                            <div className="min-w-0 flex-1 text-xs">
                                <p className="truncate font-semibold text-white" data-testid="receive-nft-preview-name">{asset.meta?.name || `Token #${asset.tokenId}`}</p>
                                <p className="truncate text-white/45">{asset.meta?.collectionName || "Collection"} · #{asset.tokenId}</p>
                                <p className="mt-1 truncate text-white/45">From: <span className="font-mono text-white/70">{shortAddr(asset.owner)}</span></p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.08)] p-3 text-xs" data-testid="receive-nft-destination">
                            <p className="text-white/60">Destination — your BIDZONE embedded wallet:</p>
                            <p className="mt-1 font-mono text-white" data-testid="receive-nft-dest-address">{dest ? shortAddr(dest) : "(wallet not ready)"}</p>
                        </div>

                        {phase === "preview" && (
                            <>
                                <button type="button" onClick={receive} disabled={!dest} data-testid="receive-nft-transfer-cta" className="inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-5 py-3 text-sm font-semibold disabled:opacity-40">
                                    <ArrowDownToLine className="h-4 w-4" /> Transfer from external wallet
                                </button>
                                {err && <p className="rounded-xl border border-[hsl(var(--bz-red)/0.4)] bg-[hsl(var(--bz-red)/0.08)] p-3 text-xs text-white/80" data-testid="receive-nft-error">{err}</p>}
                            </>
                        )}
                        {phase === "pending" && (
                            <p className="flex items-center gap-2 text-xs text-white/70" data-testid="receive-nft-pending"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for the external wallet + network confirmation…</p>
                        )}
                        {phase === "success" && (
                            <div className="rounded-xl border border-[hsl(var(--bz-green)/0.4)] bg-[hsl(var(--bz-green)/0.08)] p-3 text-xs text-white/80" data-testid="receive-nft-success">
                                Received — ownerOf verified on-chain.
                                {txHash && <a className="ml-2 underline" href={`${MONAD.explorer.replace(/\/$/, "")}/tx/${txHash}`} target="_blank" rel="noreferrer">View tx</a>}
                            </div>
                        )}
                    </div>
                )}

                <p className="mt-4 text-[10px] leading-relaxed text-white/35">
                    BIDZONE never asks for private keys or seed phrases. The external wallet signs in its own app.
                </p>
            </div>
        </div>
    );
}
