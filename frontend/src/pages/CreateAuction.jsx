import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, LogIn, FileText } from "lucide-react";
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
    auctionIdFromUuid,
    createAuctionOnchain,
} from "@/lib/bidzoneAuction";
import { MONAD } from "@/lib/monad";

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
    { label: "6 hours", hours: 6 },
    { label: "24 hours", hours: 24 },
    { label: "3 days", hours: 72 },
    { label: "7 days", hours: 168 },
];

const initialForm = {
    title: "",
    description: "",
    category: "Electronics",
    condition: "NEW",
    auctionType: "PHYSICAL",
    startingBid: "",
    minimumIncrement: "",
    durationHours: "24",
    antiSniping: "10",
};

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
    const { privyWallet, status: walletStatus } = useWallet();
    const navigate = useNavigate();
    const qc = useQueryClient();

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

        const user = session?.user;
        if (!user) return setError("Sign in required");

        let auctionId = null;
        const uploadedPaths = [];
        try {
            // 1) Create the auction row first (DRAFT) — folder target exists.
            setPhase("creating");
            const start = new Date();
            const end = new Date(Date.now() + Number(form.durationHours) * 3600 * 1000);
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
                    allowed_regions: ["GLOBAL"],
                })
                .select("id")
                .single();
            if (aErr) throw new Error(aErr.message);
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

            // Phase 6.5 — mirror the auction on-chain when contract is
            // configured AND seller has an embedded wallet ready. Failure
            // here is honest: the row is Supabase-only, and bidders will
            // fall back to application-level bids until on-chain creation
            // is retried (a Phase 6.5b task).
            if (isOnchainAvailable() && walletStatus === "ready" && privyWallet) {
                setPhase("onchain");
                try {
                    const { hash } = await createAuctionOnchain({
                        wallet: privyWallet,
                        uuid: auctionId,
                        startingBidMon: form.startingBid,
                        minimumIncrementMon: form.minimumIncrement,
                        startTime: start,
                        endTime: end,
                        antiSnipeSeconds: Number(form.antiSniping) || 10,
                    });
                    await supabase
                        .from("auctions")
                        .update({
                            contract_auction_id: auctionIdFromUuid(auctionId),
                            chain_id: MONAD.chainId,
                            contract_address: MONAD.contractAddress,
                            creation_tx_hash: hash,
                        })
                        .eq("id", auctionId);
                } catch (chainErr) {
                    // Non-blocking — auction remains LIVE off-chain.
                    toast.error("On-chain listing failed", {
                        description: (chainErr && (chainErr.shortMessage || chainErr.message)) ||
                            "The Supabase auction is live; the on-chain listing did not confirm.",
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

    const busy = phase === "creating" || phase === "uploading" || phase === "saving" || phase === "onchain";

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
                        <select className="bz-input w-full" data-testid="create-type" value={form.auctionType} onChange={set("auctionType")}>
                            <option value="PHYSICAL">Physical</option>
                            <option value="DIGITAL">Digital</option>
                        </select>
                    </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Starting bid (MON)">
                        <input
                            className="bz-input w-full"
                            data-testid="create-starting-bid"
                            value={form.startingBid}
                            onChange={set("startingBid")}
                            inputMode="decimal"
                            placeholder="0.10"
                        />
                    </Field>
                    <Field label="Minimum increment (MON)">
                        <input
                            className="bz-input w-full"
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
                        <select className="bz-input w-full" data-testid="create-duration" value={form.durationHours} onChange={set("durationHours")}>
                            {DURATIONS.map((d) => (
                                <option key={d.hours} value={d.hours}>{d.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Anti-sniping window (seconds)">
                        <input
                            className="bz-input w-full"
                            data-testid="create-anti-sniping"
                            value={form.antiSniping}
                            onChange={set("antiSniping")}
                            inputMode="numeric"
                            placeholder="10"
                        />
                    </Field>
                </div>
            </div>

            <MediaUploader media={media} setMedia={setMedia} />

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
                    {phase === "onchain" && "Listing on-chain…"}
                    {phase === "done" && "Published"}
                </button>
                <button
                    type="button"
                    data-testid="create-save-draft"
                    disabled={busy}
                    onClick={(e) => submit(e, "draft")}
                    className="inline-flex items-center gap-2 rounded-full bz-btn-secondary px-5 py-3 text-sm font-semibold disabled:opacity-50"
                >
                    <FileText className="h-4 w-4" /> Save as draft
                </button>
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
