import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    ArrowRight,
    Compass,
    Eye,
    Zap,
    MessageCircle,
    Gavel,
    Trophy,
    PackageOpen,
    Shield,
    Lock,
    BadgeCheck,
    ShieldCheck,
    Sparkles,
    Image as ImageIcon,
    Play,
} from "lucide-react";
import { LandingNav } from "@/components/landing/LandingNav";
import { LiveAuctionsSection } from "@/components/home/LiveAuctionsSection";
import { HeroVisual } from "@/components/home/Hero";
import { Footer } from "@/components/home/Footer";

/**
 * Phase Polish 1 — logged-out Landing / Welcome page.
 *
 * Positioning: "Real-Time Social Auction". Journey: Discover -> Watch ->
 * React -> Comment -> Bid -> Win -> Receive.
 *
 * Reuse policy: app routes only (/create, / + ?tab/#live-auctions,
 * / + #how-it-works), the existing Google auth modal (openAuthModal), the
 * existing live-auction data source + cards + countdown
 * (LiveAuctionsSection), the existing HeroVisual and Footer. No new routes,
 * no fake data, no second countdown implementation, no logic changes.
 */
export default function Landing() {
    const location = useLocation();

    // Same functional-navigation pattern as Home: anchors / ?tab land the
    // visitor on the section they asked for (Explore/How It Works/Footer).
    useEffect(() => {
        const target =
            location.hash ||
            (new URLSearchParams(location.search).has("tab") ||
            new URLSearchParams(location.search).has("category")
                ? "#live-auctions"
                : "");
        if (!target) return undefined;
        const t = setTimeout(() => {
            document
                .getElementById(target.slice(1))
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 350);
        return () => clearTimeout(t);
    }, [location.hash, location.search]);

    return (
        <div data-testid="page-landing" className="bz-ambient min-h-screen">
            <LandingNav />
            <main>
                <LandingHero />
                <SocialFlow />
                <LiveAuctionsSection />
                <AuctionTypes />
                <TrustSection />
                <HowPreview />
                <MonadStrip />
                <FinalCta />
            </main>
            <Footer variant="landing" />
        </div>
    );
}

/* ---------------------------------- HERO --------------------------------- */

function LandingHero() {
    return (
        <section
            data-testid="landing-hero"
            className="relative border-b border-white/[0.06] pt-16 pb-20 md:pt-24 md:pb-28"
        >
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-14 px-4 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
                <div className="max-w-2xl bz-rise">
                    <span
                        data-testid="landing-eyebrow"
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--bz-purple))]"
                    >
                        <span
                            className="bz-live-dot"
                            style={{ background: "hsl(var(--bz-purple))" }}
                        />
                        Real-Time Social Auction
                    </span>

                    <h1
                        data-testid="landing-headline"
                        className="mt-6 font-display text-4xl leading-[1.04] font-bold uppercase tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
                    >
                        Where Bids
                        <br />
                        Come <span className="bz-purple-text">Alive.</span>
                    </h1>

                    <p
                        data-testid="landing-support"
                        className="mt-6 text-lg text-white/70 md:text-xl"
                    >
                        Discover real-time auctions where people watch, react,
                        comment, bid, and win.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to={{
                                pathname: "/",
                                search: "?tab=live",
                                hash: "#live-auctions",
                            }}
                            data-testid="landing-cta-explore"
                            className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-primary px-6 py-3.5 text-sm font-semibold"
                        >
                            Explore Auctions
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            to="/create"
                            data-testid="landing-cta-start"
                            className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-secondary px-6 py-3.5 text-sm font-semibold"
                        >
                            <Gavel className="h-4 w-4 text-[hsl(var(--bz-purple))]" />
                            Start an Auction
                        </Link>
                    </div>
                </div>

                {/* Decorative showcase — same honest visual as the app hero */}
                <HeroVisual />
            </div>
        </section>
    );
}

/* ----------------------------- SOCIAL FLOW ------------------------------ */

const FLOW = [
    { icon: Compass, label: "Discover", cap: "Find items worth watching" },
    { icon: Eye, label: "Watch", cap: "Follow every second live" },
    { icon: Zap, label: "React", cap: "Feel the room, instantly" },
    { icon: MessageCircle, label: "Comment", cap: "Join the conversation" },
    { icon: Gavel, label: "Bid", cap: "Escrowed on-chain" },
    { icon: Trophy, label: "Win", cap: "Highest bid takes it" },
    { icon: PackageOpen, label: "Receive", cap: "Delivered — protected" },
];

function SocialFlow() {
    return (
        <section
            data-testid="social-flow"
            className="mx-auto max-w-[1400px] px-4 py-16 md:px-8 md:py-24"
        >
            <header className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--bz-purple))]">
                    More than an auction page
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
                    The social auction flow
                </h2>
                <p className="mt-3 text-sm text-white/55 md:text-base">
                    BIDZONE is a room, not a form. Every auction is a live
                    event you watch and shape together.
                </p>
            </header>

            <ol
                className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:mt-14 md:gap-5 lg:grid-cols-7"
            >
                {FLOW.map(({ icon: Icon, label, cap }, i) => (
                    <li
                        key={label}
                        data-testid={`flow-step-${label.toLowerCase()}`}
                        className="bz-card relative flex flex-col gap-3 p-4 md:p-5"
                    >
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="bz-icon-frame h-10 w-10">
                            <Icon
                                className="h-4.5 w-4.5 text-[hsl(var(--bz-purple))]"
                                strokeWidth={2}
                            />
                        </span>
                        <span className="font-display text-sm font-semibold md:text-base">
                            {label}
                        </span>
                        <span className="text-[11px] leading-snug text-white/45">
                            {cap}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

/* ----------------------------- AUCTION TYPES ---------------------------- */

function AuctionTypes() {
    return (
        <section
            data-testid="auction-types"
            className="mx-auto max-w-[1400px] px-4 pb-8 md:px-8 md:pb-16"
        >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <TypeCard
                    testid="type-physical"
                    icon={PackageOpen}
                    tag="Physical"
                    copy="Real-world items, protected by escrow and delivery confirmation."
                    chips={["Escrow protected", "Delivery confirmation", "Global shipping"]}
                />
                <TypeCard
                    testid="type-nft"
                    icon={ImageIcon}
                    tag="NFT"
                    copy="Real NFTs you already own, auctioned directly from your collection."
                    chips={["Your collection", "No minting required", "On-chain escrow"]}
                    flow={["Existing NFT", "My Collection", "Auction This NFT"]}
                />
            </div>
        </section>
    );
}

function TypeCard({ icon: Icon, tag, copy, chips, flow, testid }) {
    return (
        <article
            data-testid={testid}
            className="bz-card p-6 md:p-8"
        >
            <div className="flex items-center gap-3">
                <span className="bz-icon-frame h-11 w-11">
                    <Icon
                        className="h-5 w-5 text-[hsl(var(--bz-purple))]"
                        strokeWidth={2}
                    />
                </span>
                <h3 className="font-display text-xl font-bold uppercase tracking-wide md:text-2xl">
                    {tag}
                </h3>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/65 md:text-base">
                {copy}
            </p>
            {flow && (
                <ul className="mt-5 flex flex-wrap items-center gap-2 text-[11px]">
                    {flow.map((step, i) => (
                        <li key={step} className="flex items-center gap-2">
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-white/70">
                                {step}
                            </span>
                            {i < flow.length - 1 && (
                                <ArrowRight className="h-3 w-3 text-white/30" />
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <ul className="mt-5 flex flex-wrap gap-2">
                {chips.map((c) => (
                    <li
                        key={c}
                        className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-[11px] text-white/55"
                    >
                        {c}
                    </li>
                ))}
            </ul>
        </article>
    );
}

/* --------------------------- TRUST / TRANSPARENCY ------------------------ */

const TRUST = [
    {
        icon: Eye,
        title: "Transparent Bidding",
        cap: "Every bid is visible in the room — no hidden moves.",
    },
    {
        icon: Lock,
        title: "On-chain Escrow",
        cap: "Winning bids are held by the BIDZONE contract, not by us.",
    },
    {
        icon: BadgeCheck,
        title: "Real Ownership",
        cap: "NFTs auction straight from verified wallet ownership.",
    },
    {
        icon: ShieldCheck,
        title: "Protected Settlement",
        cap: "Physical orders release only after delivery is confirmed.",
    },
];

function TrustSection() {
    return (
        <section
            id="about"
            data-testid="trust-section"
            className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-16 md:px-8 md:py-24"
        >
            <header className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--bz-purple))]">
                    About BIDZONE
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
                    Built for transparent auctions
                </h2>
            </header>

            <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {TRUST.map(({ icon: Icon, title, cap }) => (
                    <li key={title} className="bz-card p-5">
                        <span className="bz-icon-frame h-10 w-10">
                            <Icon
                                className="h-4.5 w-4.5 text-[hsl(var(--bz-purple))]"
                                strokeWidth={2}
                            />
                        </span>
                        <h3 className="mt-4 font-display text-sm font-semibold md:text-base">
                            {title}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-white/50">
                            {cap}
                        </p>
                    </li>
                ))}
            </ul>

            <div
                data-testid="fee-transparency"
                className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8"
            >
                <h3 className="font-display text-lg font-semibold">
                    Simple, honest fees
                </h3>
                <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <li className="rounded-xl bg-black/25 px-4 py-3 text-sm text-white/75">
                        <span className="bz-purple-text font-display font-bold">97.5%</span> goes
                        to the seller
                    </li>
                    <li className="rounded-xl bg-black/25 px-4 py-3 text-sm text-white/75">
                        <span className="font-display font-bold text-white">2.5%</span> BIDZONE
                        fee on successful auctions
                    </li>
                    <li className="rounded-xl bg-black/25 px-4 py-3 text-sm text-white/75">
                        <span className="font-display font-bold text-white">Zero</span> fee on
                        losing bids
                    </li>
                </ul>
            </div>
        </section>
    );
}

/* ---------------------------- HOW IT WORKS PREVIEW ----------------------- */

const BUYER_PATH = ["Discover", "Bid", "Win", "Secure Settlement", "Receive Your Asset"];
const SELLER_PATH = ["Create", "Auction", "Sell"];

function HowPreview() {
    return (
        <section
            data-testid="how-preview"
            className="mx-auto max-w-[1400px] px-4 pb-8 md:px-8 md:pb-16"
        >
            <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <h2 className="font-display text-3xl font-bold md:text-4xl">
                    How BIDZONE works
                </h2>
                <Link
                    to={{ pathname: "/", hash: "#how-it-works" }}
                    data-testid="how-preview-cta"
                    className="inline-flex w-fit items-center gap-2 rounded-full bz-btn-secondary px-5 py-2.5 text-sm font-semibold"
                >
                    <Play className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                    Learn How It Works
                </Link>
            </header>

            <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
                <PathCard
                    testid="path-buyer"
                    role="Buyer"
                    icon={Gavel}
                    steps={BUYER_PATH}
                />
                <PathCard
                    testid="path-seller"
                    role="Seller"
                    icon={Sparkles}
                    steps={SELLER_PATH}
                />
            </div>
        </section>
    );
}

function PathCard({ role, icon: Icon, steps, testid }) {
    return (
        <article data-testid={testid} className="bz-card p-6 md:p-8">
            <div className="flex items-center gap-3">
                <span className="bz-icon-frame h-10 w-10">
                    <Icon
                        className="h-4.5 w-4.5 text-[hsl(var(--bz-purple))]"
                        strokeWidth={2}
                    />
                </span>
                <h3 className="font-display text-lg font-bold">{role}</h3>
            </div>
            <ol className="mt-5 space-y-3">
                {steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-sm text-white/75">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.1)] text-[10px] font-semibold text-[hsl(var(--bz-purple))]">
                            {i + 1}
                        </span>
                        {s}
                        {i < steps.length - 1 && (
                            <span className="h-px flex-1 bg-white/[0.07]" />
                        )}
                    </li>
                ))}
            </ol>
        </article>
    );
}

/* --------------------------------- MONAD --------------------------------- */

function MonadStrip() {
    return (
        <section
            data-testid="monad-strip"
            className="mx-auto max-w-[1400px] px-4 pb-8 md:px-8 md:pb-16"
        >
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white/50">
                    <span className="text-[hsl(var(--bz-purple))]">◆</span>
                    Powered by Monad
                </span>
                <p className="max-w-xl text-sm text-white/55">
                    Auctions, escrow, and ownership run on Monad — fast,
                    low-cost, and fully on-chain. You stay in control of your
                    funds and your items.
                </p>
            </div>
        </section>
    );
}

/* -------------------------------- FINAL CTA ------------------------------- */

import { useAuth } from "@/context/AuthContext";

function FinalCta() {
    const { openAuthModal } = useAuth();
    return (
        <section
            data-testid="final-cta"
            className="mx-auto max-w-[1400px] px-4 pb-20 md:px-8 md:pb-28"
        >
            <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--bz-purple)/0.25)] bg-[hsl(var(--bz-purple)/0.06)] px-6 py-14 text-center md:py-20">
                <div className="pointer-events-none absolute -inset-24 -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--bz-purple)/0.22),transparent_70%)] blur-2xl" />
                <h2
                    data-testid="final-cta-headline"
                    className="mx-auto max-w-2xl font-display text-3xl font-bold uppercase tracking-tight md:text-5xl"
                >
                    Ready to make your bid?
                </h2>
                <p className="mx-auto mt-4 max-w-md text-sm text-white/60 md:text-base">
                    Discover auctions. Join the action. Win what matters.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                        to={{
                            pathname: "/",
                            search: "?tab=live",
                            hash: "#live-auctions",
                        }}
                        data-testid="final-cta-explore"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-6 py-3.5 text-sm font-semibold sm:w-auto"
                    >
                        Explore Auctions
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button
                        type="button"
                        data-testid="final-cta-get-started"
                        onClick={() => openAuthModal({ returnTo: "/" })}
                        className="inline-flex w-full items-center justify-center rounded-full bz-btn-secondary px-6 py-3.5 text-sm font-semibold sm:w-auto"
                    >
                        Get Started
                    </button>
                </div>
            </div>
        </section>
    );
}
