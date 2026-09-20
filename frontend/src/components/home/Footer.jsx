import { Sparkles, Github, Twitter } from "lucide-react";
import { Link } from "react-router-dom";

const YEAR = new Date().getFullYear();

export function Footer() {
    return (
        <footer
            data-testid="home-footer"
            className="border-t border-white/[0.06] mt-20"
        >
            <div className="mx-auto max-w-[1400px] px-4 md:px-8 py-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <Link to="/" className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--bz-surface))] border border-white/10">
                        <Sparkles className="h-4 w-4 text-[hsl(var(--bz-purple))]" strokeWidth={2.5} />
                    </span>
                    <div className="leading-tight">
                        <div className="font-display text-base font-bold">BIDZONE</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                            Real-Time Social Auction
                        </div>
                    </div>
                </Link>

                <nav className="flex items-center gap-5 text-sm text-white/50">
                    <Link to={{ pathname: "/", search: "?tab=live", hash: "#live-auctions" }} className="hover:text-white">Live Zone</Link>
                    <Link to={{ pathname: "/", search: "?tab=all", hash: "#live-auctions" }} className="hover:text-white">Explore</Link>
                    <Link to="/create" className="hover:text-white">Create</Link>
                    <a href="#how-it-works" className="hover:text-white">How it Works</a>
                </nav>

                <div className="flex items-center gap-2">
                    <span
                        aria-label="Twitter — coming soon"
                        aria-disabled="true"
                        title="Social links are coming soon"
                        className="h-9 w-9 rounded-full border border-white/[0.08] flex items-center justify-center text-white/50 opacity-50 cursor-not-allowed"
                    >
                        <Twitter className="h-4 w-4" />
                    </span>
                    <span
                        aria-label="GitHub — coming soon"
                        aria-disabled="true"
                        title="Social links are coming soon"
                        className="h-9 w-9 rounded-full border border-white/[0.08] flex items-center justify-center text-white/50 opacity-50 cursor-not-allowed"
                    >
                        <Github className="h-4 w-4" />
                    </span>
                </div>
            </div>
            <div className="border-t border-white/[0.04]">
                <p className="mx-auto max-w-[1400px] px-4 md:px-8 py-4 text-[11px] uppercase tracking-widest text-white/30">
                    © {YEAR} BIDZONE · Where bids come alive.
                </p>
            </div>
        </footer>
    );
}
