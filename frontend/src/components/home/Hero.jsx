import { Link } from "react-router-dom";
import {
    ArrowRight,
    Shield,
    CreditCard,
    Globe2,
    Activity,
    Play,
    Sparkles,
} from "lucide-react";

const HERO_STACK = [
    {
        label: "Sneakers",
        img: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=70",
        offsetY: "translate-y-0",
        rotate: "-rotate-3",
    },
    {
        label: "Timepieces",
        img: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=70",
        offsetY: "-translate-y-6",
        rotate: "rotate-2",
    },
    {
        label: "Cameras",
        img: "https://images.unsplash.com/photo-1500634245200-e5245c7574ef?auto=format&fit=crop&w=900&q=70",
        offsetY: "translate-y-6",
        rotate: "-rotate-2",
    },
];

const FEATURES = [
    { icon: Shield, label: "Onchain Escrow" },
    { icon: CreditCard, label: "Secure Payments" },
    { icon: Globe2, label: "Global Shipping" },
    { icon: Activity, label: "Real-Time Updates" },
];

export function Hero() {
    return (
        <section
            data-testid="home-hero"
            className="relative border-b border-white/[0.06] pt-16 pb-20 md:pt-24 md:pb-28"
        >
            <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-14 px-4 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
                {/* Copy column */}
                <div className="max-w-2xl">
                    <span
                        data-testid="hero-eyebrow"
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--bz-purple))]"
                    >
                        <span className="bz-live-dot" style={{ background: "hsl(var(--bz-purple))" }} />
                        The Real-Time Auction Zone
                    </span>

                    <h1
                        data-testid="hero-headline"
                        className="mt-6 font-display text-5xl leading-[1.02] font-bold md:text-6xl lg:text-7xl"
                    >
                        Where Bids
                        <br />
                        Come <span className="bz-purple-text">Alive.</span>
                    </h1>

                    <p
                        data-testid="hero-support"
                        className="mt-6 text-lg text-white/70 md:text-xl"
                    >
                        Discover. Watch. React. Bid. Win.
                    </p>
                    <p className="mt-3 max-w-lg text-sm text-white/50 md:text-base">
                        Join live auctions, compete with others, and own unique items — all
                        onchain.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to={{ pathname: "/", search: "?tab=live", hash: "#live-auctions" }}
                            data-testid="hero-cta-primary"
                            className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-primary px-6 py-3.5 text-sm font-semibold"
                        >
                            Explore Live Auctions
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <a
                            href="#how-it-works"
                            data-testid="hero-cta-secondary"
                            className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-secondary px-6 py-3.5 text-sm font-semibold"
                        >
                            <Play className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                            How It Works
                        </a>
                    </div>

                    {/* Feature strip */}
                    <ul
                        id="how-it-works"
                        data-testid="hero-features"
                        className="mt-10 grid scroll-mt-32 grid-cols-2 gap-3 sm:grid-cols-4"
                    >
                        {FEATURES.map(({ icon: Icon, label }) => (
                            <li
                                key={label}
                                className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                            >
                                <span className="bz-icon-frame !h-8 !w-8 !rounded-lg">
                                    <Icon className="h-4 w-4" strokeWidth={2} />
                                </span>
                                <span className="text-xs font-medium text-white/80">{label}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Hero visual — decorative only, no fake auction data */}
                <HeroVisual />
            </div>
        </section>
    );
}

export function HeroVisual() {
    return (
        <div
            data-testid="hero-visual"
            className="relative mx-auto w-full max-w-[560px] lg:max-w-none"
            aria-hidden="true"
        >
            {/* Soft purple glow behind stack */}
            <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[60px] bg-[radial-gradient(60%_60%_at_60%_40%,hsl(var(--bz-purple)/0.45),transparent_70%)] blur-2xl" />

            {/* Ambient decorative badge */}
            <div className="absolute -top-4 right-2 z-20 hidden sm:flex items-center gap-2 rounded-full bg-[hsl(var(--bz-surface))]/90 border border-white/10 px-3 py-1.5 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                <span className="text-[11px] font-medium uppercase tracking-widest text-white/70">
                    Showcase
                </span>
            </div>

            <div className="relative grid grid-cols-3 gap-4">
                {HERO_STACK.map((item) => (
                    <div
                        key={item.label}
                        className={`bz-card group relative aspect-[3/4] overflow-hidden ${item.offsetY} ${item.rotate}`}
                    >
                        <img
                            src={item.img}
                            alt={`${item.label} — decorative`}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/85" />
                        <div className="relative z-10 flex h-full flex-col justify-end p-4">
                            <span className="inline-flex w-fit rounded-full bg-black/50 backdrop-blur px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/85 border border-white/10">
                                {item.label}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Category showcase caption (clearly decorative) */}
            <p className="mt-6 text-center text-[11px] uppercase tracking-[0.24em] text-white/40">
                Categories showcase · not live auction data
            </p>
        </div>
    );
}
