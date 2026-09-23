import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, LogIn, FileText, Truck, Package, ImageOff, ShieldCheck } from "lucide-react";
import { MONAD } from "@/lib/monad";
import {
    approveNftForEscrow,
    registerNftAuctionOnchain,
    readNftOwner,
    readNftListing,
    readEscrowStatus,
    fetchNftMetadata,
    isApprovedForEscrow,
    isNftAvailable,
    isTokenEscrowed,
    sameAddr,
    NFT_ESCROW_ADDRESS,
} from "@/lib/nft";
import { ensureNftTokenRow, linkNftAuction, recordNftEvent } from "@/lib/nftIndex";
import { toast } from "sonner";
import { Header } from "@/components/home/Header";
import { Footer } from "@/components/home/Footer";
import { MediaUploader } from "@/components/create/MediaUploader";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import {
    uploadAuctionMedia,
    deleteAuctionMedia,
} from "@/lib/storage";
import {
    isOnchainAvailable,
    toExplorerTx,
} from "@/lib/bidzoneAuction";
import { registerOrReconcileAuction } from "@/lib/auctionRegistration";
import { shortAddr } from "@/components/auction/format";

const CATEGORIES = [
    "Electronics",
    "Sneakers",
    "Collectibles",
    "Art & Design",
    "Gaming",
    "Fashion",
    "Luxury",
    "Jewelry",
    "Others",
];

const CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR"];

const DURATIONS = [
    { label: "1 minute", value: "0.0166666667", helper: "Quick test" },
    { label: "5 minutes", value: "0.0833333333", helper: "Fast drop" },
    { label: "10 minutes", value: "0.1666666667", helper: "Short run" },
    { label: "30 minutes", value: "0.5", helper: "Focused auction" },
    { label: "1 hour", value: "1", helper: "Recommended" },
    { label: "Custom", value: "custom", helper: "Set your own pace" },
];

const initialForm = {
    title: "",
    description: "",
    category: "Electronics",
    condition: "NEW",
    auctionType: "PHYSICAL",
    startingBid: "",
    minimumIncrement: "",
    durationHours: "1",
    durationCustomValue: "30",
    durationCustomUnit: "minutes",
    antiSniping: "10",
    shippingOrigin: "",
    allowedRegions: ["GLOBAL"],
};

function resolveDurationHours(form) {
    if (form.durationHours !== "custom") return Number(form.durationHours);
    const value = Number(form.durationCustomValue);
    return form.durationCustomUnit === "hours" ? value : value / 60;
}

// Phase 7 — destination options for PHYSICAL auctions (public, transparent).
const REGION_OPTIONS = [
    { value: "GLOBAL", label: "Worldwide" },
    { value: "ID", label: "Indonesia" },
    { value: "SEA", label: "Southeast Asia" },
    { value: "ASIA", label: "Asia" },
    { value: "EU", label: "Europe" },
    { value: "NA", label: "North America" },
    { value: "OCE", label: "Oceania" },
];


/**
 * BIDZONE Phase 6.1 — Create Auction with media.
 *
 * Orphan-safety: the auction row (DRAFT) is created BEFORE any upload, so
 * uploads always land inside an existing, seller-owned folder. If an upload
 * fails, already-uploaded objects are removed and the DRAFT can be discarded
 * (media + row) via the safe cleanup button — nothing is ever orphaned and
 * nothing fake is published.
 */
export default function CreateAuction() {
    return (
        <div data-testid="page-create-auction" className="bz-ambient min-h-screen">
            <Header />
            <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 md:pt-12">
                {!isSupabaseConfigured ? (
                    <Notice
                        icon={AlertCircle}
                        title="Storage not connected"
                        body="Auction creation needs the Supabase project to be configured for this preview."
                    />
                ) : (
                    <CreateForm />
                )}
            </main>
            <Footer />
        </div>
    );
}

function CreateForm() {
    const { session, isLoading, openAuthModal } = useAuth();
    const { privyWallet, address: walletAddress, status: walletStatus } = useWallet();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [searchParams] = useSearchParams();

    // Phase 7.2 FINAL (Model B) — NFT auctions start FROM AN OWNED NFT:
    // /create?auctionNft=<nftContract>:<tokenId> (deep-linked from
    // My Collection -> NFT Detail -> Auction This NFT). No mint-on-create,
    // no manual metadata, no upload — the asset carries itself in.
    const auctionNftParam = searchParams.get("auctionNft") || "";
    const [nftContractParam, tokenIdParam] = auctionNftParam.split(":");
    const nftAssetQuery = useQuery({
        queryKey: ["create-nft-asset", auctionNftParam],
        enabled: Boolean(isNftAvailable() && /^0x[a-fA-F0-9]{40}$/.test(nftContractParam || "") && /^\d+$/.test(tokenIdParam || "")),
        staleTime: 15_000,
        queryFn: async () => {
            const owner = String(await readNftOwner(nftContractParam, tokenIdParam));
            const escrowStatus = await readEscrowStatus(nftContractParam, tokenIdParam);
            const meta = await fetchNftMetadata(nftContractParam, tokenIdParam);
            const approved = await isApprovedForEscrow(nftContractParam, tokenIdParam, owner);
            return { nftContract: nftContractParam, tokenId: tokenIdParam, owner: String(owner), escrowStatus: Number(escrowStatus), meta, approved };
        },
    });
    const nftAsset = nftAssetQuery.data || null;
    const nftAssetErr = nftAssetQuery.error;
    const isNftFlow = Boolean(auctionNftParam) && Boolean(nftAsset);
    useEffect(() => {
        if (auctionNftParam) {
            setForm((f) => ({ ...f, auctionType: "NFT" }));
        }
    }, [auctionNftParam]);
    // Model B: the asset carries itself in — prefill title/description from
    // the token's own metadata once (never overwrites user edits).
    useEffect(() => {
        if (nftAsset && nftAsset.meta) {
            setForm((f) => ({
                ...f,
                title: f.title || (nftAsset.meta.name || `Token #${nftAsset.tokenId}`),
                description: f.description || nftAsset.meta.description || "",
            }));
        }
    }, [nftAsset]);

    const [form, setForm] = useState(initialForm);
    const [media, setMedia] = useState([]);
    const [phase, setPhase] = useState("idle"); // idle | creating | uploading | saving | done
    const [error, setError] = useState(null);
    const [draftId, setDraftId] = useState(null);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function submit(e, mode = "publish") {
        e.preventDefault();
        setError(null);

        if (!form.title.trim()) return setError("Title is required");
        if (!form.startingBid || isNaN(Number(form.startingBid)) || Number(form.startingBid) < 0)
            return setError("Starting bid must be a number ≥ 0");
        if (!form.minimumIncrement || isNaN(Number(form.minimumIncrement)) || Number(form.minimumIncrement) <= 0)
            return setError("Minimum increment must be a number > 0");
        // Phase 7.2 FINAL (Model B) — NFT auctions escrow an OWNED NFT.
        if (form.auctionType === "NFT") {
            if (mode === "draft")
                return setError("NFT auctions publish immediately (on-chain escrow) — drafts are not available for NFTs.");
            if (!isNftAvailable())
                return setError("NFT contracts are not configured for this build.");
            if (!nftAsset)
                return setError("Open an NFT from My Collection and choose 'Auction This NFT' to start here.");
            if (!sameAddr(nftAsset.owner, privyWallet?.address))
                return setError("Your embedded wallet no longer owns this NFT on-chain.");
            if ([1, 2, 3].includes(nftAsset.escrowStatus))
                return setError("This NFT is already in an auction/escrow — it cannot be listed again.");
            if (!walletStatus || walletStatus !== "ready" || !privyWallet)
                return setError("Your embedded wallet must be ready to sign the approval + escrow.");
        }
        // Phase 7 — PHYSICAL auctions ship in the real world: origin and at
        // least one destination are required (no hidden terms — BIDZONE stays
        // fully transparent; the 72h shipping deadline is fixed by the
        // existing lifecycle and shown to the seller as info).
        if (form.auctionType === "PHYSICAL") {
            if (!form.shippingOrigin.trim())
                return setError("Shipping origin is required for physical items");
            if (!(form.allowedRegions.length > 0))
                return setError("Select at least one allowed destination");
        }

        const durationHours = resolveDurationHours(form);
        if (!Number.isFinite(durationHours) || durationHours <= 0) {
            return setError("Choose a duration longer than zero");
        }
        if (form.durationHours === "custom" && form.durationCustomUnit === "minutes" && durationHours < (1 / 60)) {
            return setError("Custom duration must be at least 1 minute");
        }

        const user = session?.user;
        if (!user) return setError("Sign in required");

        let auctionId = null;
        const uploadedPaths = [];
        try {
            // 1) Create the auction row first (DRAFT) — folder target exists.
            setPhase("creating");
            const start = new Date();
            // The single end timestamp is shared by Supabase and the on-chain
            // registration path. The contract remains the source of truth once
            // the transaction is confirmed; this UI never runs a second timer.
            const end = new Date(Date.now() + durationHours * 3600 * 1000);
            const { data: auction, error: aErr } = await supabase
                .from("auctions")
                .insert({
                    seller_id: user.id,
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    category: form.category,
                    condition: form.condition,
                    auction_type: form.auctionType,
                    starting_bid: form.startingBid,
                    minimum_increment: form.minimumIncrement,
                    start_time: start.toISOString(),
                    end_time: end.toISOString(),
                    anti_sniping_seconds: Number(form.antiSniping) || 10,
                    status: "DRAFT",
                    allowed_regions: form.allowedRegions.length
                        ? form.allowedRegions
                        : ["GLOBAL"],
                    shipping_origin:
                        form.auctionType === "PHYSICAL"
                            ? form.shippingOrigin.trim() || null
                            : null,
                })
                .select("id")
                .single();
            if (aErr) {
                if (/shipping_origin|PGRST204|column .* does not exist/i.test(aErr.message || "")) {
                    throw new Error(
                        "Physical auctions need the Phase 7 database migration — run supabase/migrations/20260204000001_bidzone_physical_auction.sql in the Supabase SQL Editor first."
                    );
                }
                throw new Error(aErr.message);
            }
            auctionId = auction.id;
            setDraftId(auctionId);

            // 2) Upload media into the seller-owned folder (RLS-protected).
            setPhase("uploading");
            const items = [];
            for (let i = 0; i < media.length; i++) {
                const m = media[i];
                try {
                    setMedia((cur) => cur.map((x, xi) => (xi === i ? { ...x, uploading: true, progress: 1, error: null } : x)));
                    const path = await uploadAuctionMedia({
                        auctionId,
                        file: m.file,
                        onProgress: (p) =>
                            setMedia((cur) => cur.map((x, xi) => (xi === i ? { ...x, progress: p } : x))),
                    });
                    uploadedPaths.push(path);
                    setMedia((cur) => cur.map((x, xi) => (xi === i ? { ...x, uploading: false, progress: 100, uploadedPath: path } : x)));
                    items.push({
                        auction_id: auctionId,
                        media_url: path,
                        media_type: m.mediaType,
                        sort_order: i,
                    });
                } catch (upErr) {
                    // Upload failed — clean up everything uploaded in this round.
                    if (uploadedPaths.length) {
                        await deleteAuctionMedia(uploadedPaths).catch(() => {});
                    }
                    throw new Error(upErr.message || "Media upload failed");
                }
            }

            // 3) Persist media references in the EXISTING auction_items table.
            setPhase("saving");
            if (items.length) {
                const { error: iErr } = await supabase.from("auction_items").insert(items);
                if (iErr) {
                    await deleteAuctionMedia(uploadedPaths).catch(() => {});
                    throw new Error(iErr.message);
                }
            }

            // 3a-NFT) Model B: the NFT's own metadata image IS the media —
            // no upload flow (auction items list the token image directly).
            if (form.auctionType === "NFT" && nftAsset?.meta?.image) {
                try {
                    await supabase.from("auction_items").insert({
                        auction_id: auctionId,
                        media_url: nftAsset.meta.image,
                        media_type: "IMAGE",
                        sort_order: 0,
                    });
                } catch (mErr) {
                    console.warn("[bidzone:nft] media insert failed:", mErr?.message);
                }
            }

            // 3b) Phase 7.2 FINAL (Model B) — NFT: the auction escrows an
            // EXISTING owned NFT. Sequence: verify ownership -> verify not
            // listed -> approve (token-specific) -> escrow register -> index.
            // Every step is USER-signed (embedded wallet, user pays gas); the
            // auction only becomes LIVE if every step succeeded — a failed
            // escrow never shows a successful listing.
            if (form.auctionType === "NFT") {
                setPhase("verifying");
                const owner = String(await readNftOwner(nftAsset.nftContract, nftAsset.tokenId));
                if (!sameAddr(owner, privyWallet.address))
                    throw new Error("On-chain check failed: your embedded wallet no longer owns this NFT.");
                if (await isTokenEscrowed(nftAsset.nftContract, nftAsset.tokenId))
                    throw new Error("This NFT is already held by the escrow contract.");

                setPhase("approving");
                if (!nftAsset.approved) {
                    await approveNftForEscrow({ wallet: privyWallet, nftContract: nftAsset.nftContract, tokenId: nftAsset.tokenId });
                }

                setPhase("escrowing");
                const registered = await registerNftAuctionOnchain({
                    wallet: privyWallet,
                    nftContract: nftAsset.nftContract,
                    tokenId: nftAsset.tokenId,
                    startingBidMon: form.startingBid,
                    minimumIncrementMon: form.minimumIncrement,
                    endTime: end.toISOString(),
                    antiSnipeSeconds: Number(form.antiSniping) || 10,
                });

                // Index sync AFTER on-chain success (Supabase is an index/cache).
                setPhase("saving");
                try {
                    const { row: tokenRow } = await ensureNftTokenRow({
                        session,
                        nftContract: nftAsset.nftContract,
                        tokenId: nftAsset.tokenId,
                        tokenUri: nftAsset.meta?.tokenUriRaw || "",
                        name: nftAsset.meta?.name || form.title.trim(),
                        description: nftAsset.meta?.description || form.description.trim() || null,
                        collectionName: nftAsset.meta?.collectionName || undefined,
                        attributes: nftAsset.meta?.attributes || [],
                        ownerWallet: privyWallet.address,
                    });
                    await linkNftAuction({ session, auctionId, nftContract: nftAsset.nftContract, tokenId: nftAsset.tokenId });
                    if (tokenRow) {
                        await recordNftEvent({ session, tokenRowId: tokenRow.id, eventType: "ESCROW", txHash: registered.hash, toWallet: NFT_ESCROW_ADDRESS });
                    }
                } catch (idxErr) {
                    // Index failure is non-fatal — the chain holds the NFT and
                    // the auction; the index converges on the next discovery.
                    console.warn("[bidzone:nft] index sync failed:", idxErr?.message);
                }
                toast.success("NFT escrowed on Monad Testnet", {
                    description: `Token #${nftAsset.tokenId} is now held by the escrow contract.`,
                });
            }

            // 4) Publish: DRAFT -> LIVE. ("draft" mode keeps the row as a
            // DRAFT — publishable later from the Auction Room owner bar.)
            if (mode === "draft") {
                qc.invalidateQueries({ queryKey: ["home-auctions"] });
                setPhase("done");
                toast.success("Draft saved", {
                    description: "Publish it any time from the auction room.",
                });
                navigate("/");
                return;
            }
            const { error: pErr } = await supabase
                .from("auctions")
                .update({ status: "LIVE" })
                .eq("id", auctionId);
            if (pErr) throw new Error(pErr.message);

            // Phase 6.5b — mirror the auction on-chain when contract is
            // configured AND seller has an embedded wallet ready. The shared
            // helper reads the contract FIRST (duplicate protection: an
            // already-registered auction is reconciled, never re-created) and
            // writes Supabase ONLY after transaction confirmation. Failure is
            // honest: the row stays recoverable via the Auction Room
            // "Register On-Chain" retry (Phase 6.5b).
            // Phase 7.2 FINAL (Model B): NFT auctions skip the app-level
            // BidzoneAuction mirror — their money + asset flow through
            // BidzoneNFTEscrow (registerAuction/placeBid/settle).
            if (isOnchainAvailable() && walletStatus === "ready" && privyWallet && form.auctionType !== "NFT") {
                setPhase("onchain");
                try {
                    const res = await registerOrReconcileAuction({
                        wallet: privyWallet,
                        auction: { id: auctionId, starting_bid: form.startingBid, minimum_increment: form.minimumIncrement, start_time: start.toISOString(), end_time: end.toISOString(), anti_sniping_seconds: Number(form.antiSniping) || 10, contract_auction_id: null },
                    });
                    if (res.reconciled) {
                        toast.info("Auction already registered on-chain", {
                            description: "Supabase state was reconciled — no new transaction was needed.",
                        });
                    } else {
                        toast.success("Auction registered on Monad Testnet", {
                            description: toExplorerTx(res.hash),
                        });
                    }
                } catch (chainErr) {
                    // Non-blocking — auction remains recoverable.
                    toast.error("On-chain registration pending", {
                        description: (chainErr && (chainErr.shortMessage || chainErr.message)) ||
                            "The auction is live in BIDZONE but is not registered on-chain yet. Use 'Register On-Chain' in the auction room.",
                    });
                }
            }

            qc.invalidateQueries({ queryKey: ["home-auctions"] });
            qc.invalidateQueries({ queryKey: ["auction", auctionId] });
            setPhase("done");
            navigate(`/auction/${auctionId}`);
        } catch (err) {
            setPhase("idle");
            setError(err.message || "Something went wrong");
        }
    }

    async function discardDraft() {
        if (!draftId) return;
        try {
            const paths = media.map((m) => m.uploadedPath).filter(Boolean);
            if (paths.length) await deleteAuctionMedia(paths);
            await supabase.from("auctions").delete().eq("id", draftId);
        } catch {
            /* best-effort cleanup */
        }
        setDraftId(null);
        setMedia([]);
        setPhase("idle");
        setError(null);
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-24 text-white/50">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
        );
    }

    if (!session) {
        return (
            <Notice
                icon={LogIn}
                title="Sign in required"
                body="You need a BIDZONE identity to create an auction and upload media."
                actionLabel="Sign in with Google"
                onAction={() => openAuthModal({ returnTo: "/create" })}
                testId="create-signin-cta"
            />
        );
    }

    const busy = phase === "creating" || phase === "uploading" || phase === "saving" || phase === "onchain" || phase === "minting" || phase === "approving" || phase === "escrowing";

    return (
        <form onSubmit={submit} className="space-y-6">
            <div>
                <h1 className="font-display text-3xl font-bold">Create Auction</h1>
                <p className="mt-1 text-sm text-white/50">
                    Transparent auction economics — no secret reserves, no secret minimums.
                </p>
            </div>

            <div className="bz-card space-y-4 p-4 md:p-5">
                <Field label="Title">
                    <input
                        className="bz-input w-full"
                        data-testid="create-title"
                        value={form.title}
                        onChange={set("title")}
                        maxLength={120}
                        placeholder="What are you selling?"
                    />
                </Field>
                <Field label="Description">
                    <textarea
                        className="bz-input min-h-24 w-full"
                        data-testid="create-description"
                        value={form.description}
                        onChange={set("description")}
                        maxLength={2000}
                        placeholder="Condition, provenance, anything bidders should know"
                    />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field label="Category">
                        <select className="bz-input w-full" data-testid="create-category" value={form.category} onChange={set("category")}>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Condition">
                        <select className="bz-input w-full" data-testid="create-condition" value={form.condition} onChange={set("condition")}>
                            {CONDITIONS.map((c) => (
                                <option key={c} value={c}>{c.replace("_", " ")}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Type">
                        <select
                            className="bz-input w-full"
                            data-testid="create-type"
                            value={form.auctionType}
                            onChange={set("auctionType")}
                            disabled={Boolean(auctionNftParam)}
                        >
                            <option value="PHYSICAL">Physical</option>
                            <option value="NFT">
                                {auctionNftParam ? "NFT (on-chain) — from your collection" : "NFT — start from My Collection"}
                            </option>
                            <option value="DIGITAL_NON_NFT" disabled>Digital (non-NFT) — Coming Soon</option>
                        </select>
                        {form.auctionType === "NFT" && !auctionNftParam && (
                            <div
                                data-testid="create-nft-hint"
                                className="mt-2 rounded-xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.08)] p-3 text-[11px] leading-relaxed text-white/75"
                            >
                                NFT auctions escrow an owned ERC-721 token from your wallet.
                                Open <span className="font-semibold text-white">My Collection</span>, choose an NFT and tap
                                <span className="font-semibold text-white"> Auction This NFT</span> to return here with the token pre-loaded.
                                <div className="mt-2">
                                    <Link
                                        to="/profile?tab=collection"
                                        data-testid="create-nft-open-collection"
                                        className="inline-flex items-center gap-1.5 rounded-full bz-btn-primary px-4 py-1.5 text-[11px] font-semibold"
                                    >
                                        Open My Collection →
                                    </Link>
                                </div>
                            </div>
                        )}
                    </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Starting bid (MON)">
                        <input
                            className="bz-input w-full sm:w-40"
                            data-testid="create-starting-bid"
                            value={form.startingBid}
                            onChange={set("startingBid")}
                            inputMode="decimal"
                            placeholder="0.10"
                        />
                    </Field>
                    <Field label="Minimum increment (MON)">
                        <input
                            className="bz-input w-full sm:w-40"
                            data-testid="create-min-increment"
                            value={form.minimumIncrement}
                            onChange={set("minimumIncrement")}
                            inputMode="decimal"
                            placeholder="0.01"
                        />
                    </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Duration">
                        <select
                            className="bz-input w-full sm:w-52"
                            data-testid="create-duration"
                            value={form.durationHours}
                            onChange={set("durationHours")}
                        >
                            {DURATIONS.map((d) => (
                                <option key={d.value} value={d.value}>{d.label} · {d.helper}</option>
                            ))}
                        </select>
                        {form.durationHours === "custom" && (
                            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2" data-testid="create-duration-custom">
                                <input
                                    className="bz-input w-full"
                                    data-testid="create-duration-custom-value"
                                    type="number"
                                    min="1"
                                    step="1"
                                    inputMode="numeric"
                                    value={form.durationCustomValue}
                                    onChange={set("durationCustomValue")}
                                    aria-label="Custom duration value"
                                    placeholder="30"
                                />
                                <select
                                    className="bz-input w-28"
                                    data-testid="create-duration-custom-unit"
                                    value={form.durationCustomUnit}
                                    onChange={set("durationCustomUnit")}
                                    aria-label="Custom duration unit"
                                >
                                    <option value="minutes">minutes</option>
                                    <option value="hours">hours</option>
                                </select>
                            </div>
                        )}
                        <p className="mt-1.5 text-[10px] text-white/40">Short auctions create urgency; the confirmed end time stays authoritative.</p>
                    </Field>
                    <Field label="Anti-sniping window (seconds)">
                        <input
                            className="bz-input w-full sm:w-40"
                            data-testid="create-anti-sniping"
                            value={form.antiSniping}
                            onChange={set("antiSniping")}
                            inputMode="numeric"
                            placeholder="10"
                        />
                    </Field>
                </div>

                {auctionNftParam && !nftAsset && (
                    <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-4 text-xs text-white/60" data-testid="create-nft-loading">
                        {nftAssetErr
                            ? "Could not read this NFT on-chain. Make sure the contract address and token id are correct, then reopen it from My Collection."
                            : "Reading the NFT from Monad Testnet…"}
                    </div>
                )}
                {isNftFlow && nftAsset && (
                    <div className="rounded-2xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.06)] p-4" data-testid="nft-selected-card">
                        <div className="flex items-start gap-3">
                            {nftAsset.meta?.image ? (
                                <img src={nftAsset.meta.image} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-white/[0.06] object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                            ) : (
                                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                                    <Package className="h-6 w-6 text-white/30" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1 text-xs">
                                <p className="truncate text-sm font-semibold text-white" data-testid="nft-selected-name">{nftAsset.meta?.name || `Token #${nftAsset.tokenId}`}</p>
                                <p className="truncate text-white/45" data-testid="nft-selected-collection">{nftAsset.meta?.collectionName || "Collection"} · #{nftAsset.tokenId}</p>
                                {nftAsset.meta?.rarity && <p className="mt-0.5 text-white/45">Rarity: {nftAsset.meta.rarity}</p>}
                                {(nftAsset.meta?.attributes || []).slice(0, 4).map((a, i) => (
                                    <span key={i} className="mr-1 mt-1 inline-block rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
                                        {a.trait_type}: {a.value}
                                    </span>
                                ))}
                                <p className="mt-1.5 font-mono text-[10px] text-white/40" data-testid="nft-selected-contract">{shortAddr(nftAsset.nftContract)} · owner {shortAddr(nftAsset.owner)}</p>
                            </div>
                        </div>
                        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/50" data-testid="nft-flow-note">
                            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--bz-purple))]" />
                            Publishing verifies on-chain ownership, requests token approval, and escrows the NFT in
                            BidzoneNFTEscrow (you sign + pay gas). Metadata comes from the token itself — nothing to
                            upload. NFT auctions publish immediately — drafts are not available.
                        </p>
                    </div>
                )}

                {form.auctionType === "PHYSICAL" && (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field label="Shipping origin">
                                <input
                                    className="bz-input w-full sm:w-56"
                                    data-testid="create-shipping-origin"
                                    value={form.shippingOrigin}
                                    onChange={set("shippingOrigin")}
                                    maxLength={80}
                                    placeholder="e.g. Jakarta, Indonesia"
                                />
                            </Field>
                            <Field label="Shipping deadline">
                                <div
                                    data-testid="create-shipping-deadline-note"
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-xs text-white/60"
                                >
                                    <Truck className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--bz-purple))]" />
                                    Seller ships within 72 hours after payment is secured
                                    (BIDZONE standard).
                                </div>
                            </Field>
                        </div>
                        <Field label="Allowed destinations">
                            <div
                                data-testid="create-regions"
                                className="flex flex-wrap gap-2"
                            >
                                {REGION_OPTIONS.map((r) => {
                                    const active = form.allowedRegions.includes(r.value);
                                    return (
                                        <button
                                            key={r.value}
                                            type="button"
                                            data-testid={`create-region-${r.value}`}
                                            aria-pressed={active}
                                            onClick={() =>
                                                setForm((f) => ({
                                                    ...f,
                                                    allowedRegions: active
                                                        ? f.allowedRegions.filter((x) => x !== r.value)
                                                        : [...f.allowedRegions, r.value],
                                                }))
                                            }
                                            className={
                                                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition " +
                                                (active
                                                    ? "border-[hsl(var(--bz-purple)/0.6)] bg-[hsl(var(--bz-purple)/0.16)] text-white"
                                                    : "border-white/[0.1] bg-white/[0.02] text-white/60 hover:text-white hover:border-white/25")
                                            }
                                        >
                                            {r.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                    </>
                )}
            </div>

            {!isNftFlow && <MediaUploader media={media} setMedia={setMedia} />}
            {isNftFlow && (
                <p className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] text-white/45" data-testid="nft-no-upload-note">
                    <ImageOff className="h-3.5 w-3.5" /> NFT imagery comes from the token metadata — no upload needed.
                </p>
            )}

            {error && (
                <div
                    data-testid="create-error"
                    className="flex items-start gap-2 rounded-xl border border-[hsl(var(--bz-red))]/40 bg-[hsl(var(--bz-red))]/10 px-4 py-3 text-sm text-white/90"
                >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--bz-red))]" />
                    <div>
                        {error}
                        {draftId && (
                            <button
                                type="button"
                                onClick={discardDraft}
                                data-testid="create-discard-draft"
                                className="ml-2 underline underline-offset-2 hover:text-white"
                            >
                                Discard draft & clean up media
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={busy}
                    data-testid="create-submit"
                    className="bz-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold disabled:opacity-50"
                >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {phase === "idle" && "Publish auction"}
                    {phase === "creating" && "Creating auction…"}
                    {phase === "uploading" && "Uploading media…"}
                    {phase === "saving" && "Saving media…"}
                    {phase === "verifying" && "Verifying NFT on-chain…"}
                    {phase === "approving" && "Approving escrow…"}
                    {phase === "escrowing" && "Escrowing NFT…"}
                    {phase === "onchain" && "Listing on-chain…"}
                    {phase === "done" && "Published"}
                </button>
                {form.auctionType !== "NFT" && (
                    <button
                        type="button"
                        data-testid="create-save-draft"
                        disabled={busy}
                        onClick={(e) => submit(e, "draft")}
                        className="inline-flex items-center gap-2 rounded-full bz-btn-secondary px-5 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                        <FileText className="h-4 w-4" /> Save as draft
                    </button>
                )}
                <Link to="/" className="text-sm text-white/50 hover:text-white">
                    Cancel
                </Link>
            </div>
        </form>
    );
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/50">
                {label}
            </span>
            {children}
        </label>
    );
}

function Notice({ icon: Icon, title, body, actionLabel, onAction, testId }) {
    return (
        <div className="bz-card mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
            <Icon className="h-8 w-8 text-white/40" />
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="text-sm text-white/50">{body}</p>
            {actionLabel && onAction ? (
                <button
                    type="button"
                    data-testid={testId || "notice-action"}
                    onClick={onAction}
                    className="bz-btn-primary mt-2 rounded-full px-5 py-2.5 text-sm"
                >
                    {actionLabel}
                </button>
            ) : (
                <Link to="/" className="bz-btn-primary mt-2 rounded-full px-5 py-2.5 text-sm">
                    Back to Home
                </Link>
            )}
        </div>
    );
}
