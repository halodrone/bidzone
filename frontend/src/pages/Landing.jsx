import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
    Gavel,
    PackageOpen,
    Truck,
    ShieldCheck,
    ArrowRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LandingNav } from "@/components/landing/LandingNav";
import { Footer } from "@/components/home/Footer";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Reveal, useParallax, useCountUp } from "@/lib/motion";

/**
 * Phase Polish 2 — the BIDZONE Welcome Story.
 *
 * A cinematic, scroll-driven narrative. NOT Home/Discover:
 * no auction grid, no feed, no live listing. HOME = participate.
 * LANDING = understand BIDZONE and fall in love with the experience.
 *
 * Routing stays: guest > Landing (this), authed > Home (LandingGate).
 * Auth CTAs reuse the existing openAuthModal — no fake routes.
 * All visuals are decorative/editorial; nothing here touches contracts,
 * bidding, escrow, shipping, NFT ownership, or settlement logic.
 */

const IMG = {
    gavel: "https://images.unsplash.com/photo-1645570990200-2701a49d45ca?crop=entropy&cs=srgb&fm=jpg&q=80&w=1600",
    gavelGold: "https://images.unsplash.com/photo-1629877521896-4719f02df3c7?crop=entropy&cs=srgb&fm=jpg&q=80&w=1600",
    watch: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
    watchRose: "https://images.unsplash.com/photo-1600003014608-c2ccc1570a65?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
    camera: "https://images.unsplash.com/photo-1505226755626-21044548b8aa?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
    cameraDslr: "https://images.unsplash.com/photo-1561613596-ae8056651e6d?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
    sneaker: "https://images.unsplash.com/photo-1648586383984-5555e558b1a9?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
    nftArt: "https://images.unsplash.com/photo-1618556450991-2f1af64e8191?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
    nftNeon: "https://images.unsplash.com/photo-1563089145-599997674d42?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
};

function Chapter({ n, label, className = "" }) {
    return (
        <Reveal
            variant="fade"
            className={`flex items-center gap-3 ${className}`}
        >
            <span className="font-display text-xs font-semibold tracking-[0.3em] text-[hsl(var(--bz-purple))]">
                {n}
            </span>
            <span className="h-px w-10 bg-[hsl(var(--bz-purple)/0.45)]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {label}
            </span>
        </Reveal>
    );
}

export default function Landing() {
    const location = useLocation();

    // Anchor navigation for nav/footer links (#about, #how-it-works, ...).
    useEffect(() => {
        if (!location.hash) return undefined;
        const t = setTimeout(() => {
            document
                .getElementById(location.hash.slice(1))
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 400);
        return () => clearTimeout(t);
    }, [location.hash]);

    return (
        <div data-testid="page-landing" className="bz-ambient min-h-screen overflow-x-clip">
            <LandingNav />
            <main>
                <Welcome />
                <WhatIs />
                <Story />
                <HowItWorks />
                <TheBid />
                <NftSection />
                <Transparency />
                <ShippingSection />
                <PaymentSection />
                <MonadSection />
                <FinalCta />
            </main>
            <Footer variant="landing" />
        </div>
    );
}

/* ============================ SECTION 01 — WELCOME ============================ */

function Welcome() {
    const { openAuthModal } = useAuth();
    const plx = useParallax(0.06);
    return (
        <section
            data-testid="welcome-hero"
            className="relative flex min-h-[100svh] items-center overflow-hidden"
        >
            {/* Cinematic backdrop — gavel in the dark, slow drift + parallax */}
            <div className="absolute inset-0 -z-10" aria-hidden="true">
                <div ref={plx} className="absolute inset-[-6%] will-change-transform">
                    <img
                        src={IMG.gavel}
                        alt=""
                        loading="eager"
                        className="bz-drift h-full w-full object-cover opacity-45"
                    />
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--bz-bg))]/60 via-[hsl(var(--bz-bg))]/35 to-[hsl(var(--bz-bg))]" />
                <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_35%,transparent,hsl(var(--bz-bg))/85)]" />
            </div>

            <div className="mx-auto w-full max-w-[1400px] px-4 pt-24 pb-16 text-center md:px-8">
                <Reveal variant="fade" className="mx-auto">
                    <span
                        data-testid="welcome-eyebrow"
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--bz-purple))]"
                    >
                        <span className="bz-live-dot" style={{ background: "hsl(var(--bz-purple))" }} />
                        Real-Time Social Auction
                    </span>
                </Reveal>

                <Reveal variant="up" delay={120}>
                    <h1
                        data-testid="welcome-headline"
                        className="mx-auto mt-7 max-w-4xl font-display text-5xl font-bold uppercase leading-[1.02] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
                    >
                        Welcome to BIDZONE
                    </h1>
                </Reveal>

                <Reveal variant="up" delay={260}>
                    <p
                        data-testid="welcome-statement"
                        className="mt-5 font-display text-2xl font-bold uppercase tracking-tight text-[hsl(var(--bz-purple))] sm:text-3xl md:text-4xl"
                    >
                        Where bids come alive.
                    </p>
                </Reveal>

                <Reveal variant="up" delay={400}>
                    <p className="mx-auto mt-5 max-w-xl text-base text-white/65 md:text-lg">
                        A real-time social auction where people discover, watch,
                        react, comment, bid, win, and receive.
                    </p>
                </Reveal>

                <Reveal variant="up" delay={540} className="mt-9">
                    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            data-testid="welcome-get-started"
                            onClick={() => openAuthModal({ returnTo: "/" })}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-7 py-3.5 text-sm font-semibold sm:w-auto"
                        >
                            <Gavel className="h-4 w-4" />
                            Get Started
                        </button>
                    </div>
                </Reveal>

                <Reveal variant="fade" delay={700} className="mt-16">
                    <div
                        data-testid="scroll-indicator"
                        className="mx-auto flex w-fit flex-col items-center gap-2 text-white/40"
                    >
                        <span className="text-[10px] uppercase tracking-[0.3em]">
                            Scroll to explore
                        </span>
                        <span className="bz-scrollhint h-10 w-px bg-gradient-to-b from-[hsl(var(--bz-purple))] to-transparent" />
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

/* ========================= SECTION 02 — WHAT IS BIDZONE ======================= */

const JOURNEY_WORDS = ["Discover", "Watch", "React", "Comment", "Bid", "Win", "Receive"];

function WhatIs() {
    return (
        <section
            id="about"
            data-testid="what-is"
            className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-24 md:px-8 md:py-36"
        >
            <Chapter n="02" label="What is BIDZONE" />

            <div className="mt-10 max-w-5xl">
                <Reveal variant="up">
                    <h2
                        data-testid="what-is-headline"
                        className="font-display text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-5xl md:text-6xl"
                    >
                        What is BIDZONE?
                    </h2>
                </Reveal>
                <Reveal variant="up" delay={160}>
                    <p className="mt-8 font-display text-2xl font-bold uppercase tracking-tight text-white/85 sm:text-3xl md:text-4xl">
                        Not just an auction.
                    </p>
                </Reveal>
                <Reveal variant="up" delay={300}>
                    <p className="mt-3 font-display text-2xl font-bold uppercase tracking-tight sm:text-3xl md:text-4xl">
                        It&apos;s the experience <span className="bz-purple-text">around the bid.</span>
                    </p>
                </Reveal>
                <Reveal variant="up" delay={430}>
                    <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60 md:text-lg">
                        BIDZONE brings the energy of a live auction into a
                        social, interactive experience.
                    </p>
                </Reveal>
            </div>

            {/* The journey — words rise one after another */}
            <div
                data-testid="journey-words"
                className="mt-16 flex flex-wrap items-baseline gap-x-5 gap-y-3 md:mt-24"
            >
                {JOURNEY_WORDS.map((w, i) => (
                    <React.Fragment key={w}>
                        <Reveal
                            as="span"
                            variant="up"
                            delay={i * 140}
                            className="font-display text-3xl font-bold uppercase tracking-tight text-white/90 sm:text-4xl md:text-5xl"
                        >
                            {w}
                        </Reveal>
                        {i < JOURNEY_WORDS.length - 1 && (
                            <Reveal
                                as="span"
                                variant="fade"
                                delay={i * 140 + 70}
                                className="text-2xl text-[hsl(var(--bz-purple))] md:text-3xl"
                            >
                                <span aria-hidden="true">·</span>
                            </Reveal>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}

/* ===================== SECTION 03 — EVERY BID TELLS A STORY =================== */

function Story() {
    return (
        <section
            data-testid="story-showcase"
            className="relative overflow-hidden py-24 md:py-36"
        >
            <div className="mx-auto max-w-[1400px] px-4 md:px-8">
                <Chapter n="03" label="Every bid tells a story" />

                <div className="mt-10 max-w-3xl">
                    <Reveal variant="up">
                        <h2 className="font-display text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-5xl md:text-6xl">
                            Every bid tells <span className="bz-purple-text">a story.</span>
                        </h2>
                    </Reveal>
                    <Reveal variant="up" delay={200}>
                        <p className="mt-6 text-base leading-relaxed text-white/60 md:text-lg">
                            From rare finds to everyday treasures, every auction
                            has a moment when someone decides to make the next
                            move.
                        </p>
                    </Reveal>
                </div>

                {/* Editorial collage — overlapping, scaled, parallaxed.
                    Decorative imagery only; no auction data. */}
                <div className="relative mt-14 md:mt-20">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-12 md:gap-0">
                        <Reveal variant="left" delay={80} className="col-span-2 md:col-span-5 md:col-start-1 md:row-start-1">
                            <EditorialImg src={IMG.sneaker} label="Sneakers" ratio="aspect-[4/5]" parallax={0.05} />
                        </Reveal>
                        <Reveal variant="scale" delay={220} className="md:col-span-4 md:col-start-7 md:row-start-1 md:translate-y-10">
                            <EditorialImg src={IMG.watch} label="Timepieces" ratio="aspect-[3/4]" parallax={0.1} />
                        </Reveal>
                        <Reveal variant="right" delay={340} className="md:col-span-3 md:col-start-11 md:row-start-1 md:-translate-y-6">
                            <EditorialImg src={IMG.camera} label="Collectibles" ratio="aspect-[3/4]" parallax={0.14} />
                        </Reveal>
                        <Reveal variant="up" delay={460} className="md:col-span-4 md:col-start-4 md:row-start-2 md:-mt-16">
                            <EditorialImg src={IMG.watchRose} label="Luxury" ratio="aspect-square" parallax={0.07} />
                        </Reveal>
                        <Reveal variant="up" delay={580} className="md:col-span-4 md:col-start-9 md:row-start-2 md:mt-10">
                            <EditorialImg src={IMG.cameraDslr} label="Objects of desire" ratio="aspect-[4/5]" parallax={0.12} />
                        </Reveal>
                    </div>
                    <div
                        className="pointer-events-none absolute -inset-x-24 top-1/3 -z-10 h-96 bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--bz-purple)/0.14),transparent_70%)] blur-3xl"
                        aria-hidden="true"
                    />
                </div>
            </div>
        </section>
    );
}

function EditorialImg({ src, label, ratio, parallax = 0.08 }) {
    const plx = useParallax(parallax);
    return (
        <figure
            className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] ${ratio}`}
        >
            <div ref={plx} className="absolute inset-[-8%] will-change-transform">
                <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-[1.04]"
                />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/70" />
            <figcaption className="absolute bottom-3 left-3 z-10">
                <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/85 backdrop-blur">
                    {label}
                </span>
            </figcaption>
        </figure>
    );
}

/* ============================ SECTION 04 — THE BID ============================ */

function TheBid() {
    return (
        <section
            data-testid="the-bid"
            className="relative scroll-mt-24 overflow-hidden border-y border-white/[0.05] py-24 md:py-36"
        >
            <div
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_55%,hsl(var(--bz-purple)/0.12),transparent_70%)]"
                aria-hidden="true"
            />
            <div className="mx-auto max-w-[1400px] px-4 text-center md:px-8">
                <Chapter n="04" label="The bid" className="justify-center" />

                <Reveal variant="up">
                    <h2
                        data-testid="the-bid-headline"
                        className="mt-10 font-display text-5xl font-bold uppercase leading-[1.02] tracking-tight sm:text-6xl md:text-7xl"
                    >
                        Make your <span className="bz-purple-text">move.</span>
                    </h2>
                </Reveal>

                {/* Stylized bid moment — illustrative storytelling only, never
                    a real auction state and never interactive. */}
                <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 md:mt-20">
                    <Reveal variant="left" delay={120}>
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-8">
                            <p className="text-[10px] uppercase tracking-[0.26em] text-white/40">
                                Current bid
                            </p>
                            <p className="mt-3 font-display text-4xl font-bold tabular-nums md:text-5xl">
                                0.42 <span className="text-lg text-white/50">MON</span>
                            </p>
                        </div>
                    </Reveal>
                    <Reveal variant="scale" delay={260}>
                        <div className="rounded-2xl border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.07)] px-6 py-8 shadow-[0_0_60px_hsl(var(--bz-purple)/0.18)]">
                            <p className="text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--bz-purple))]">
                                Next bid
                            </p>
                            <p className="mt-3 font-display text-4xl font-bold tabular-nums text-white md:text-5xl">
                                0.45 <span className="text-lg text-white/60">MON</span>
                            </p>
                        </div>
                    </Reveal>
                    <Reveal variant="right" delay={400}>
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-8">
                            <p className="text-[10px] uppercase tracking-[0.26em] text-white/40">
                                Time remaining
                            </p>
                            <p className="mt-3 font-display text-4xl font-bold tabular-nums md:text-5xl">
                                00:0<span className="bz-tension">7</span>
                            </p>
                        </div>
                    </Reveal>
                </div>

                <Reveal variant="up" delay={540}>
                    <p className="mt-10 text-base text-white/60 md:text-lg">
                        One bid can change everything.
                    </p>
                </Reveal>
                <Reveal variant="fade" delay={650}>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/30">
                        Illustrative moment — the real tension happens live, in the room
                    </p>
                </Reveal>
            </div>
        </section>
    );
}

/* ============================ SECTION 05 — NFT ============================== */

const NFT_FLOW = ["My Collection", "Select NFT", "Auction This NFT", "Bids", "Winner", "NFT Received"];

function NftSection() {
    return (
        <section
            data-testid="nft-section"
            className="mx-auto max-w-[1400px] px-4 py-24 md:px-8 md:py-36"
        >
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div>
                    <Chapter n="05" label="BIDZONE NFT" />
                    <Reveal variant="up" className="mt-10">
                        <h2 className="font-display text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-5xl md:text-6xl">
                            Your NFT.
                            <br />
                            Your <span className="bz-purple-text">auction.</span>
                        </h2>
                    </Reveal>
                    <Reveal variant="up" delay={180}>
                        <p className="mt-6 max-w-md text-base leading-relaxed text-white/60 md:text-lg">
                            Already own an NFT? Put it up for auction directly
                            from your collection.
                        </p>
                    </Reveal>
                    <Reveal variant="up" delay={300}>
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/45">
                            BIDZONE never mints for you — the NFT stays yours,
                            in your wallet, until a winner claims it on-chain.
                        </p>
                    </Reveal>

                    <ol data-testid="nft-flow" className="mt-10 space-y-3">
                        {NFT_FLOW.map((s, i) => (
                            <Reveal as="li" key={s} variant="left" delay={i * 120} className="flex items-center gap-3">
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.1)] font-display text-[11px] font-semibold text-[hsl(var(--bz-purple))]">
                                    {i + 1}
                                </span>
                                <span className="text-sm font-medium text-white/80">{s}</span>
                                {i < NFT_FLOW.length - 1 && (
                                    <span className="h-px flex-1 bg-white/[0.06]" />
                                )}
                            </Reveal>
                        ))}
                    </ol>
                </div>

                {/* NFT visual — enters with subtle scale, art-first */}
                <div className="relative">
                    <Reveal variant="scale" delay={150}>
                        <figure className="relative mx-auto max-w-sm overflow-hidden rounded-3xl border border-white/[0.08]">
                            <img
                                src={IMG.nftArt}
                                alt=""
                                loading="lazy"
                                className="aspect-square w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
                            <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
                                <span className="font-display text-sm font-semibold">
                                    From your collection
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/80 backdrop-blur">
                                    Verified on-chain
                                </span>
                            </figcaption>
                        </figure>
                    </Reveal>
                    <Reveal variant="right" delay={350} className="absolute -bottom-8 -right-2 hidden w-44 sm:block md:-right-6">
                        <figure className="overflow-hidden rounded-2xl border border-white/[0.08]">
                            <img
                                src={IMG.nftNeon}
                                alt=""
                                loading="lazy"
                                className="aspect-square w-full object-cover"
                            />
                        </figure>
                    </Reveal>
                    <div
                        className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(55%_55%_at_55%_45%,hsl(var(--bz-purple)/0.16),transparent_70%)] blur-3xl"
                        aria-hidden="true"
                    />
                </div>
            </div>
        </section>
    );
}

/* ========================= SECTION 06 — TRANSPARENCY ======================== */

function Transparency() {
    const [refSeller, seller] = useCountUp(97.5);
    const [refFee, fee] = useCountUp(2.5);
    return (
        <section
            data-testid="transparency"
            className="relative overflow-hidden border-y border-white/[0.05] py-24 md:py-36"
        >
            <div className="mx-auto max-w-[1400px] px-4 md:px-8">
                <Chapter n="06" label="Transparency" />

                <Reveal variant="up" className="mt-10">
                    <h2
                        data-testid="transparency-headline"
                        className="font-display text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-5xl md:text-6xl"
                    >
                        Transparent by design.
                    </h2>
                </Reveal>
                <Reveal variant="up" delay={180}>
                    <p className="mt-5 font-display text-xl font-semibold uppercase tracking-tight text-white/75 md:text-2xl">
                        No hidden reserve. No surprise fees.
                    </p>
                </Reveal>

                <div className="mt-14 grid grid-cols-1 items-end gap-10 sm:grid-cols-2 md:mt-20">
                    <div ref={refSeller} data-testid="fee-seller">
                        <Reveal variant="scale">
                            <p className="font-display text-7xl font-bold tracking-tight sm:text-8xl md:text-9xl">
                                {seller.toFixed(1)}
                                <span className="text-3xl text-white/50 md:text-5xl">%</span>
                            </p>
                            <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-[hsl(var(--bz-purple))]">
                                Seller
                            </p>
                        </Reveal>
                    </div>
                    <div ref={refFee} data-testid="fee-bidzone">
                        <Reveal variant="scale" delay={200}>
                            <p className="font-display text-6xl font-bold tracking-tight text-white/85 sm:text-7xl md:text-8xl">
                                {fee.toFixed(1)}
                                <span className="text-2xl text-white/40 md:text-4xl">%</span>
                            </p>
                            <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-white/40">
                                BIDZONE
                            </p>
                        </Reveal>
                    </div>
                </div>

                <Reveal variant="up" delay={300} className="mt-14">
                    <p className="font-display text-lg font-semibold uppercase tracking-tight text-white/85 md:text-xl">
                        Losing bids pay no BIDZONE fee.
                    </p>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 md:text-base">
                        BIDZONE takes 2.5% only from successful auction
                        settlement.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}

/* ========================== SECTION 07 — SHIPPING =========================== */

const SHIP_STEPS = ["Seller", "Choose Carrier", "Tracking", "In Transit", "Delivered", "Buyer"];
const CARRIERS = ["JNE", "J&T", "SiCepat", "DHL", "FedEx", "UPS", "Pos Indonesia", "Cainiao", "Other"];

function ShippingSection() {
    return (
        <section
            data-testid="shipping-section"
            className="mx-auto max-w-[1400px] px-4 py-24 md:px-8 md:py-36"
        >
            <Chapter n="07" label="Shipping & delivery" />

            <Reveal variant="up" className="mt-10">
                <h2
                    data-testid="shipping-headline"
                    className="max-w-3xl font-display text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-5xl md:text-6xl"
                >
                    Win it.
                    <br />
                    Follow the <span className="bz-purple-text">journey.</span>
                </h2>
            </Reveal>
            <Reveal variant="up" delay={180}>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60 md:text-lg">
                    Choose your carrier. Add your tracking. Follow the journey.
                </p>
            </Reveal>

            {/* The journey — package travels SELLER > CARRIER > BUYER */}
            <div data-testid="ship-journey" className="mt-16">
                {/* Desktop: animated horizontal journey */}
                <div className="hidden md:block">
                    <div className="relative">
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-[hsl(var(--bz-purple)/0.4)] via-white/[0.12] to-[hsl(var(--bz-purple)/0.4)]" />
                        {/* traveling package: wrapper width = track - dot so
                            translateX(100%) lands exactly at the last node */}
                        <div className="absolute inset-y-0 left-0" style={{ width: "calc(100% - 18px)" }}>
                            <span
                                aria-hidden="true"
                                className="bz-journey-dot absolute left-0 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-[hsl(var(--bz-purple))] shadow-[0_0_18px_hsl(var(--bz-purple)/0.9)] will-change-transform"
                            />
                        </div>
                        <ol className="relative flex items-start justify-between">
                            {SHIP_STEPS.map((s, i) => (
                                <Reveal as="li" key={s} variant="up" delay={i * 130} className="flex flex-col items-center gap-3">
                                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-[hsl(var(--bz-surface))]">
                                        {i === 0 || i === SHIP_STEPS.length - 1 ? (
                                            <PackageOpen className="h-4 w-4 text-[hsl(var(--bz-purple))]" />
                                        ) : (
                                            <Truck className="h-4 w-4 text-[hsl(var(--bz-purple))]" />
                                        )}
                                    </span>
                                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
                                        {s}
                                    </span>
                                </Reveal>
                            ))}
                        </ol>
                    </div>
                </div>

                {/* Mobile: vertical ladder */}
                <ol className="space-y-4 md:hidden">
                    {SHIP_STEPS.map((s, i) => (
                        <Reveal as="li" key={s} variant="left" delay={i * 110} className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-[hsl(var(--bz-surface))]">
                                <Truck className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                            </span>
                            <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">
                                {s}
                            </span>
                        </Reveal>
                    ))}
                </ol>
            </div>

            <Reveal variant="fade" delay={350} className="mt-14">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                    Your carrier, your choice
                </p>
                <p data-testid="carrier-list" className="mt-3 text-sm text-white/55">
                    {CARRIERS.join("  ·  ")}
                </p>
            </Reveal>
        </section>
    );
}

/* ========================== SECTION 08 — PAYMENT =========================== */

const ESCROW_FLOW = ["Bid", "Escrow", "Delivery", "Confirm", "Release", "Settlement"];

function PaymentSection() {
    return (
        <section
            data-testid="payment-secured"
            className="relative overflow-hidden border-y border-white/[0.05] py-24 md:py-36"
        >
            <div
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_45%,hsl(var(--bz-purple)/0.1),transparent_70%)]"
                aria-hidden="true"
            />
            <div className="mx-auto max-w-[1400px] px-4 text-center md:px-8">
                <Chapter n="08" label="Payment secured" className="justify-center" />

                <Reveal variant="up" className="mt-10">
                    <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.1)]">
                        <ShieldCheck className="h-6 w-6 text-[hsl(var(--bz-purple))]" />
                    </div>
                    <h2
                        data-testid="payment-headline"
                        className="mx-auto max-w-3xl font-display text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-5xl md:text-6xl"
                    >
                        Your payment.
                        <br />
                        <span className="bz-purple-text">Secured.</span>
                    </h2>
                </Reveal>
                <Reveal variant="up" delay={180}>
                    <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/60 md:text-lg">
                        Winning bids are secured through on-chain escrow while
                        the item completes its journey.
                    </p>
                </Reveal>

                <ol
                    data-testid="escrow-flow"
                    className="mx-auto mt-14 flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-3"
                >
                    {ESCROW_FLOW.map((s, i) => (
                        <React.Fragment key={s}>
                            <Reveal as="li" variant="scale" delay={i * 130}>
                                <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
                                    {s}
                                </span>
                            </Reveal>
                            {i < ESCROW_FLOW.length - 1 && (
                                <Reveal as="span" variant="fade" delay={i * 130 + 65} aria-hidden="true">
                                    <span className="text-white/25">→</span>
                                </Reveal>
                            )}
                        </React.Fragment>
                    ))}
                </ol>
            </div>
        </section>
    );
}

/* ============================ SECTION 09 — MONAD ============================ */

function MonadSection() {
    return (
        <section
            data-testid="monad-strip"
            className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 md:py-28"
        >
            <div className="flex flex-col items-center gap-4 text-center">
                <Reveal variant="scale">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2">
                        <span className="text-[hsl(var(--bz-purple))]">◆</span>
                        <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-white/85">
                            Powered by Monad
                        </span>
                    </span>
                </Reveal>
                <Reveal variant="fade" delay={160}>
                    <p className="max-w-md text-sm text-white/50">
                        On-chain infrastructure for a new generation of
                        real-time auctions.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}

/* ============================ SECTION 10 — FINAL CTA ======================== */

function FinalCta() {
    const { openAuthModal } = useAuth();
    const plx = useParallax(0.05);
    return (
        <section
            data-testid="final-cta"
            className="relative overflow-hidden py-28 md:py-44"
        >
            <div className="absolute inset-0 -z-10" aria-hidden="true">
                <div ref={plx} className="absolute inset-[-8%] will-change-transform">
                    <img
                        src={IMG.gavelGold}
                        alt=""
                        loading="lazy"
                        className="bz-drift h-full w-full object-cover opacity-30"
                    />
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--bz-bg))] via-[hsl(var(--bz-bg))]/55 to-[hsl(var(--bz-bg))]" />
            </div>

            <div className="mx-auto max-w-[1400px] px-4 text-center md:px-8">
                <Chapter n="10" label="Final call" className="justify-center" />
                <Reveal variant="up" className="mt-10">
                    <h2
                        data-testid="final-cta-headline"
                        className="mx-auto max-w-4xl font-display text-4xl font-bold uppercase leading-[1.02] tracking-tight sm:text-5xl md:text-7xl"
                    >
                        Ready to take your first <span className="bz-purple-text">bid?</span>
                    </h2>
                </Reveal>
                <Reveal variant="up" delay={200}>
                    <p className="mx-auto mt-5 max-w-md text-base text-white/65 md:text-lg">
                        The next auction is waiting.
                    </p>
                </Reveal>
                <Reveal variant="up" delay={340} className="mt-10">
                    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            data-testid="final-get-started"
                            onClick={() => openAuthModal({ returnTo: "/" })}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-8 py-4 text-sm font-semibold sm:w-auto"
                        >
                            <Gavel className="h-4 w-4" />
                            Get Started
                        </button>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
