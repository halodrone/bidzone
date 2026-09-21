import { useState } from "react";
import { X, Loader2, ExternalLink, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { MONAD } from "@/lib/monad";
import { shortAddr } from "@/components/auction/format";
import { sendNftOnchain, sameAddr, isTokenEscrowed, readNftOwner } from "@/lib/nft";
import { recordNftEvent } from "@/lib/nftIndex";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";

/**
 * BIDZONE Phase 7.2 FINAL (Model B) — SEND NFT (embedded → external).
 * Validation: valid EVM address, not zero, not self, owned on-chain, not in
 * escrow. Two-step confirm with gas note; tx hash + explorer on success;
 * collection refreshes from ownerOf — no DB-owned truth.
 */
export function SendNftModal({ open, onClose, asset }) {
    const qc = useQueryClient();
    const { session } = useAuth();
    const { wallet } = useWallet();
    const [to, setTo] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [state, setState] = useState("idle"); // idle | pending | success | failed
    const [txHash, setTxHash] = useState(null);

    if (!open || !asset) return null;

    const { nftContract, tokenId, meta } = asset;
    const trimmed = to.trim();
    const valid = /^0x[a-fA-F0-9]{40}$/.test(trimmed) && !/^0x0{40}$/i.test(trimmed) && !sameAddr(trimmed, wallet?.address);

    async function send() {
        if (!valid || state === "pending") return;
        setState("pending");
        try {
            // Final pre-flight: on-chain ownership + escrow lock (never trust cache).
            const owner = await readNftOwner(nftContract, tokenId);
            if (!sameAddr(owner, wallet?.address)) throw new Error("This NFT is no longer owned by your embedded wallet");
            if (await isTokenEscrowed(nftContract, tokenId)) throw new Error("This NFT is locked in the escrow contract");

            const res = await sendNftOnchain({ wallet, nftContract, tokenId, toAddress: trimmed });
            setTxHash(res.hash);
            // Index the real transfer (best-effort — chain is authoritative).
            try {
                if (asset.tokenRowId) {
                    await recordNftEvent({ session, tokenRowId: asset.tokenRowId, eventType: "TRANSFER", txHash: res.hash, toWallet: trimmed });
                } else if (supabase && session?.user) {
                    const found = await supabase.from("nft_tokens").select("id").eq("nft_contract", String(nftContract).toLowerCase()).eq("token_id", String(tokenId)).maybeSingle();
                    if (found?.data) await recordNftEvent({ session, tokenRowId: found.data.id, eventType: "TRANSFER", txHash: res.hash, toWallet: trimmed });
                }
            } catch { /* index best-effort */ }
            setState("success");
            qc.invalidateQueries({ queryKey: ["my-collection"] });
            qc.invalidateQueries({ queryKey: ["nft-asset"] });
            toast.success("NFT sent — ownership updated on-chain");
        } catch (e) {
            setState("failed");
            toast.error("Send failed", { description: (e && (e.shortMessage || e.message)) || "Nothing was sent. Try again." });
        }
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" data-testid="send-nft-modal" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative max-h-full w-full max-w-md overflow-y-auto rounded-3xl bz-card p-6">
                <button type="button" onClick={onClose} aria-label="Close" data-testid="send-nft-close" className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 hover:text-white">
                    <X className="h-4 w-4" />
                </button>
                <h3 className="font-display text-lg font-bold text-white">Send NFT to an external wallet</h3>
                <p className="mt-1 text-xs text-white/50" data-testid="send-nft-summary">
                    {meta?.name || `Token #${tokenId}`} · #{tokenId} — signed by your embedded wallet (you pay gas).
                </p>
                <label className="mt-5 block">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/50">Destination wallet</span>
                    <input className="bz-input w-full font-mono" data-testid="send-nft-address" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" maxLength={42} disabled={state === "pending"} />
                </label>
                {to && !valid && <p className="mt-1.5 text-[11px] text-[hsl(var(--bz-red))]" data-testid="send-nft-invalid">Enter a valid EVM address (not zero, not your own wallet).</p>}

                {state === "idle" && !confirming && (
                    <button type="button" data-testid="send-nft-continue" disabled={!valid} onClick={() => setConfirming(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-5 py-3 text-sm font-semibold disabled:opacity-40">
                        <Send className="h-4 w-4" /> Continue
                    </button>
                )}
                {state === "idle" && confirming && (
                    <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/25 p-3 text-xs text-white/70" data-testid="send-nft-confirm-box">
                        <p className="font-semibold text-white">Confirm transfer</p>
                        <p className="mt-1">From: <span className="font-mono">BIDZONE Embedded Wallet</span></p>
                        <p>To: <span className="font-mono text-white">{shortAddr(trimmed)}</span></p>
                        <p>NFT: <span className="text-white">{meta?.name || `#${tokenId}`} · #{tokenId}</span></p>
                        <p className="mt-1 text-white/45">You pay the network gas. This cannot be undone.</p>
                        <div className="mt-2 flex gap-2">
                            <button type="button" data-testid="send-nft-confirm" onClick={send} className="rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold">Confirm & Sign</button>
                            <button type="button" onClick={() => setConfirming(false)} className="rounded-full bz-btn-secondary px-4 py-1.5 text-[11px] font-semibold">Cancel</button>
                        </div>
                    </div>
                )}
                {state === "pending" && (
                    <p className="mt-4 flex items-center gap-2 text-xs text-white/70" data-testid="send-nft-pending"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for network confirmation…</p>
                )}
                {state === "success" && (
                    <div className="mt-4 rounded-xl border border-[hsl(var(--bz-green)/0.4)] bg-[hsl(var(--bz-green)/0.08)] p-3 text-xs text-white/80" data-testid="send-nft-success">
                        Sent — ownership verified on-chain.
                        {txHash && <a className="ml-2 underline" href={`${MONAD.explorer.replace(/\/$/, "")}/tx/${txHash}`} target="_blank" rel="noreferrer" data-testid="send-nft-tx">View tx <ExternalLink className="inline h-3 w-3" /></a>}
                    </div>
                )}
                {state === "failed" && (
                    <p className="mt-4 rounded-xl border border-[hsl(var(--bz-red)/0.4)] bg-[hsl(var(--bz-red)/0.08)] p-3 text-xs text-white/80" data-testid="send-nft-failed"><AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />The transaction failed — nothing was sent. Please try again.</p>
                )}
            </div>
        </div>
    );
}
