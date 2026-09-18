import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck, Wallet } from "lucide-react";

export function CreateAuctionCTA() {
    return (
        <section
            data-testid="home-create-cta"
            className="mx-auto max-w-[1400px] px-4 md:px-8 py-16 md:py-24"
            id="create-auction"
        >
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[hsl(var(--bz-surface))]/60 px-6 py-14 md:px-14 md:py-16">
                {/* Ambient gradients */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute -left-40 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-[hsl(var(--bz-purple)/0.35)] blur-[120px]"
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-24 -bottom-24 h-[320px] w-[320px] rounded-full bg-[hsl(var(--bz-blue)/0.20)] blur-[110px]"
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage:
                            "linear-gradient(hsl(var(--bz-text)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--bz-text)) 1px, transparent 1px)",
                        backgroundSize: "44px 44px",
                    }}
                />

                <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                    <div>
                        <span
                            data-testid="create-cta-label"
                            className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.10)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--bz-purple))]"
                        >
                            <Sparkles className="h-3 w-3" />
                            Just Launched
                        </span>

                        <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] md:text-5xl">
                            Create Your Own Auction
                        </h2>
                        <p className="mt-4 max-w-lg text-base text-white/60">
                            Got something special? Start your auction and reach a global
                            audience.
                        </p>

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link
                                to="/create"
                                data-testid="create-cta-primary"
                                className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-primary px-6 py-3.5 text-sm font-semibold"
                            >
                                Create Auction
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <a
                                href="#how-it-works"
                                className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-secondary px-6 py-3.5 text-sm font-semibold"
                            >
                                Learn More
                            </a>
                        </div>
                    </div>

                    {/* Fee transparency block */}
                    <aside
                        data-testid="fee-transparency"
                        className="relative rounded-2xl border border-white/10 bg-black/25 p-6 backdrop-blur"
                    >
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/50">
                            <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--bz-purple))]" />
                            Fee Transparency
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <div>
                                <div className="font-display text-3xl font-bold text-[hsl(var(--bz-purple))]">
                                    2.5%
                                </div>
                                <div className="mt-1 text-xs text-white/60">Platform fee</div>
                            </div>
                            <div>
                                <div className="font-display text-3xl font-bold text-white">
                                    97.5%
                                </div>
                                <div className="mt-1 text-xs text-white/60">Goes to seller</div>
                            </div>
                        </div>
                        <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-white/70">
                            <Wallet className="h-4 w-4 mt-0.5 text-[hsl(var(--bz-purple))]" />
                            <p>
                                Winner pays exactly the displayed bid — no hidden buyer premium.
                                Losing bidders pay nothing.
                            </p>
                        </div>
                    </aside>
                </div>
            </div>
        </section>
    );
}
