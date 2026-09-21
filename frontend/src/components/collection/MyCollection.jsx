import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";import { Link } from "react-router-dom";
import { Package, Loader2, ArrowDownToLine, Sparkles, ExternalLink, Gavel } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { supabase } from "@/lib/supabase";
import { MONAD } from "@/lib/monad";
import {
    NFT_CONTRACT_ADDRESS, readNftOwner, readNftListing, readEscrowStatus, fetchNftMetadata,
    discoverOwnedTransfers, mintNft, sameAddr,
} from "@/lib/nft";
import { ensureNftTokenRow, recordNftEvent, findActiveAuctionForToken } from "@/lib/nftIndex";
import { NftDetailModal } from "@/components/collection/NftDetailModal";
import { ReceiveNftModal } from "@/components/collection/ReceiveNftModal";
import { SendNftModal } from "@/components/collection/SendNftModal";

/**
 * BIDZONE Phase 7.2 FINAL (Model B) — MY COLLECTION.
 * A real wallet-owned NFT collection: on-chain ownerOf is the source of
 * truth. Discovery = index rows (nft_tokens / nft_auctions) + Transfer logs,
 * then EVERY candidate is verified live via ownerOf + escrow statusOf.
 * States: AVAILABLE (auction/send allowed), IN AUCTION, IN ESCROW (locked).
 * The DATABASE IS ONLY AN INDEX — a stale row never proves ownership.
 */

const STATUS_LABEL = { AVAILABLE: "AVAILABLE", IN_AUCTION: "IN AUCTION", IN_ESCROW: "IN ESCROW" };

export function MyCollection() {
    const { session, profile } = useAuth();
    const { privyWallet, status: walletStatus, address: embeddedAddress } = useWallet();
    const myWallet = profile?.wallet_address || embeddedAddress || null;
    const qc = useQueryClient();
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [detail, setDetail] = useState(null); // { asset, sendOpen }
    const [minting, setMinting] = useState(false);

    const q = useQuery({
        queryKey: ["my-collection", (myWallet || "").toLowerCase()],
        enabled: Boolean(supabase && myWallet),
        refetchInterval: 60_000,
        queryFn: async () => {
            // -------- 1) Candidate tokens from the index (never trusted) ----
            const candidates = new Map(); // `${contract}:${tokenId}` -> {nftContract, tokenId, indexRow}
            const add = (nftContract, tokenId, indexRow = null) => {
                if (!nftContract || tokenId == null) return;
                const key = `${String(nftContract).toLowerCase()}:${String(tokenId)}`;
                if (!candidates.has(key)) candidates.set(key, { nftContract: String(nftContract).toLowerCase(), tokenId: String(tokenId), indexRow });
            };

            try {
                const { data: rows } = await supabase
                    .from("nft_tokens")
                    .select("id, nft_contract, token_id, token_uri, name, description, collection_name, attributes, chain_id, auction_id")
                    .eq("chain_id", MONAD.chainId)
                    .order("created_at", { ascending: false })
                    .limit(300);
                (rows || []).forEach((r) => add(r.nft_contract, r.token_id, r));
            } catch { /* index unavailable — chain discovery still runs */ }

            // My NFT auctions -> link rows -> token candidates
            try {
                const { data: mine } = await supabase
                    .from("auctions")
                    .select("id, nft_auctions ( nft_contract, token_id )")
                    .eq("seller_id", session.user.id)
                    .eq("auction_type", "NFT")
                    .order("created_at", { ascending: false })
                    .limit(50);
                (mine || []).forEach((a) => (a.nft_auctions || []).forEach((l) => add(l.nft_contract, l.token_id, null)));
            } catch { /* migration not applied yet — degrade honestly */ }

            // -------- 2) Chain discovery: Transfer logs TO my wallet --------
            const contracts = [...new Set([NFT_CONTRACT_ADDRESS.toLowerCase(), ...[...candidates.values()].map((c) => c.nftContract)])].filter(Boolean);
            const discovered = await discoverOwnedTransfers({ ownerWallet: myWallet, nftContracts: contracts });
            discovered.forEach((d) => add(d.nftContract, d.tokenId, null));

            // Device-local recent-mints cache (REAL confirmed txs only) —
            // rides over public-RPC lag between mint and index/log discovery.
            try {
                const raw = JSON.parse(localStorage.getItem(`bz_nft_recent:${String(myWallet).toLowerCase()}`) || "[]");
                (Array.isArray(raw) ? raw : []).slice(0, 20).forEach((r) => r && r.nftContract && r.tokenId != null && add(r.nftContract, r.tokenId, null));
            } catch { /* cache optional */ }

            // -------- 3) Verify EVERY candidate on-chain (truth) ------------
            const verified = [];
            const list = [...candidates.values()].slice(0, 60); // sanity cap
            for (const c of list) {
                try {
                    const owner = String(await readNftOwner(c.nftContract, c.tokenId)).toLowerCase();
                    const escrowStatus = await readEscrowStatus(c.nftContract, c.tokenId);
                    let status = null;
                    if (sameAddr(owner, myWallet)) status = "AVAILABLE";
                    else if (sameAddr(owner, NFT_ESCROW_LOWER)) {
                        // owner is the escrow — is it MY listing?
                        const l = await readNftListing(c.nftContract, c.tokenId);
                        if (l && sameAddr(l.seller, myWallet)) status = Number(escrowStatus) === 1 ? "IN_AUCTION" : "IN_ESCROW";
                    }
                    if (!status) continue; // not mine — skip (stale rows never lie)
                    verified.push({ ...c, owner, escrowStatus: Number(escrowStatus), status });
                } catch { /* token gone / reverted — skip */ }
            }
            return verified;
        },
    });

    const tokens = q.data || [];

    async function mintDemo() {
        if (minting) return;
        if (walletStatus !== "ready" || !privyWallet) {
            toast.error("Embedded wallet is not ready");
            return;
        }
        setMinting(true);
        try {
            const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#7c3aed'/><stop offset='1' stop-color='#09090b'/></linearGradient></defs><rect width='600' height='600' fill='url(#g)'/><text x='50%' y='46%' font-family='Arial' font-size='54' font-weight='bold' fill='white' text-anchor='middle'>BIDZONE</text><text x='50%' y='56%' font-family='Arial' font-size='22' fill='#c4b5fd' text-anchor='middle'>DEMO NFT \u00b7 TESTNET</text></svg>";
            const imgDataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
            const metaJson = {
                name: "BIDZONE Demo NFT",
                description: "A testnet demo asset for exercising the Model B NFT lifecycle: collect, auction, escrow, win, send.",
                image: imgDataUri,
                attributes: [{ trait_type: "Edition", value: "Testnet Demo" }, { trait_type: "Chain", value: "Monad Testnet" }],
            };
            const tokenUri = `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(metaJson))))}`;
            const minted = await mintNft({ wallet: privyWallet, tokenUri });
            // Index (insert-own; chain is authoritative)
            try {
                const { row } = await ensureNftTokenRow({
                    session, nftContract: NFT_CONTRACT_ADDRESS, tokenId: minted.tokenId,
                    tokenUri, name: metaJson.name, description: metaJson.description,
                    collectionName: "BIDZONE Demo", attributes: metaJson.attributes, ownerWallet: myWallet,
                });
                if (row) await recordNftEvent({ session, tokenRowId: row.id, eventType: "MINT", txHash: minted.hash, toWallet: myWallet });
            } catch (idxErr) { console.warn('[bidzone:nft] demo-mint index failed:', idxErr?.message); }
            try {
                const key = `bz_nft_recent:${String(myWallet).toLowerCase()}`;
                const raw = JSON.parse(localStorage.getItem(key) || "[]");
                raw.unshift({ nftContract: NFT_CONTRACT_ADDRESS, tokenId: String(minted.tokenId), txHash: minted.hash, ts: Date.now() });
                localStorage.setItem(key, JSON.stringify(raw.slice(0, 20)));
            } catch { /* cache optional */ }
            toast.success(`Demo NFT #${minted.tokenId} minted to your embedded wallet`);
            qc.invalidateQueries({ queryKey: ["my-collection"] });
        } catch (e) {
            toast.error("Mint failed", { description: (e && (e.shortMessage || e.message)) || "Try again." });
        } finally {
            setMinting(false);
        }
    }

    return (
        <div data-testid="my-collection">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-white/50">
                    NFTs owned by your embedded wallet — verified live on-chain (ownerOf).{" "}
                    <span className="text-white/35">{MONAD.network} · chain {MONAD.chainId}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setReceiveOpen(true)} data-testid="receive-nft-cta"
                        className="inline-flex items-center gap-1.5 rounded-full bz-btn-secondary px-3.5 py-2 text-[11px] font-semibold">
                        <ArrowDownToLine className="h-3.5 w-3.5" /> Receive NFT
                    </button>
                    <button type="button" onClick={mintDemo} disabled={minting || walletStatus !== "ready"} data-testid="demo-mint-cta" title="Mint a testnet demo NFT to your embedded wallet (not part of any auction flow)"
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] font-semibold text-white/70 hover:text-white disabled:opacity-40">
                        {minting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Mint demo NFT (testnet)
                    </button>
                </div>
            </div>

            {q.isLoading ? (
                <p className="mt-6 flex items-center gap-2 text-xs text-white/50" data-testid="collection-loading"><Loader2 className="h-4 w-4 animate-spin" /> Reading your wallet from the chain…</p>
            ) : tokens.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center" data-testid="collection-empty">
                    <Package className="mx-auto h-8 w-8 text-white/25" />
                    <p className="mt-3 text-sm font-semibold text-white">Your collection is empty</p>
                    <p className="mt-1 text-xs text-white/45">Receive an NFT from an external wallet, mint a demo asset, or win an NFT auction.</p>
                </div>
            ) : (
                <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="collection-grid">
                    {tokens.map((t) => (
                        <CollectionCard key={`${t.nftContract}:${t.tokenId}`} token={t} onOpen={() => setDetail({ token: t, sendOpen: false })} />
                    ))}
                </ul>
            )}

            <ReceiveNftModal open={receiveOpen} onClose={() => setReceiveOpen(false)} myAddress={myWallet} />
            <DetailHost detail={detail} onClose={() => setDetail(null)} wallet={privyWallet} />
        </div>
    );
}

const NFT_ESCROW_LOWER = (process.env.REACT_APP_NFT_ESCROW_ADDRESS || "").toLowerCase();

function DetailHost({ detail, onClose, wallet }) {
    const [sendOpen, setSendOpen] = useState(false);
    if (!detail) return null;
    const t = detail.token;
    const asset = {
        nftContract: t.nftContract, tokenId: t.tokenId, owner: t.owner,
        escrowStatus: t.escrowStatus, listing: t.listing, wallet,
        status: t.status, meta: t.meta, activeAuctionId: t.activeAuctionId,
        onSend: () => setSendOpen(true),
    };
    return (
        <>
            <NftDetailModal open={!sendOpen} onClose={onClose} asset={asset} />
            <SendNftModal open={sendOpen} onClose={() => { setSendOpen(false); onClose(); }} asset={asset} />
        </>
    );
}

/** Card: lazy metadata (image/name/traits) + live status chip. */
function CollectionCard({ token, onOpen }) {
    const { data: meta } = useQuery({
        queryKey: ["nft-meta", token.nftContract, token.tokenId],
        staleTime: 10 * 60_000,
        queryFn: () => fetchNftMetadata(token.nftContract, token.tokenId),
    });
    const { data: activeAuction } = useQuery({
        queryKey: ["nft-active-auction", token.nftContract, token.tokenId],
        enabled: token.status === "IN_AUCTION",
        staleTime: 30_000,
        queryFn: () => findActiveAuctionForToken({ nftContract: token.nftContract, tokenId: token.tokenId }),
    });

    const name = meta?.name || token.indexRow?.name || `Token #${token.tokenId}`;
    const collection = meta?.collectionName || token.indexRow?.collection_name || "Collection";
    const chip = {
        AVAILABLE: "border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] text-white",
        IN_AUCTION: "border-[hsl(var(--bz-purple)/0.5)] bg-[hsl(var(--bz-purple)/0.12)] text-white",
        IN_ESCROW: "border-amber-400/50 bg-amber-400/10 text-white",
    }[token.status];

    return (
        <li className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-[hsl(var(--bz-purple)/0.4)]" data-testid="collection-card">
            <button type="button" onClick={onOpen} data-testid="collection-open-detail" className="block w-full text-left">
                <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
                    {meta?.image ? (
                        <img src={meta.image} alt={name} className="aspect-square w-full object-cover" data-testid={`collection-image-${token.tokenId}`} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[hsl(var(--bz-purple)/0.2)] to-transparent">
                            <Package className="h-10 w-10 text-white/20" />
                        </div>
                    )}
                    <span className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wide ${chip || "border-white/15 bg-white/[0.04] text-white/70"}`} data-testid={`collection-status-${token.tokenId}`}>
                        {STATUS_LABEL[token.status]}
                    </span>
                </div>
                <div className="mt-2.5">
                    <p className="truncate text-sm font-semibold text-white">{name}</p>
                    <p className="truncate text-[11px] text-white/45">{collection} · #{token.tokenId}</p>
                    {(meta?.rarity || (meta?.attributes?.length ? meta.attributes[0] : null)) && (
                        <p className="mt-1 truncate text-[10px] text-white/40" data-testid={`collection-traits-${token.tokenId}`}>
                            {meta.rarity ? `Rarity: ${meta.rarity}` : `${meta.attributes[0].trait_type}: ${meta.attributes[0].value}`}
                        </p>
                    )}
                </div>
            </button>
            {token.status === "IN_AUCTION" && activeAuction?.auctionId && (
                <Link to={`/auction/${activeAuction.auctionId}`} data-testid={`collection-auction-link-${token.tokenId}`}
                    className="mt-2 inline-flex items-center gap-1 text-[10px] text-white/55 underline hover:text-white">
                    <Gavel className="h-3 w-3" /> Open auction room
                </Link>
            )}
        </li>
    );
}
