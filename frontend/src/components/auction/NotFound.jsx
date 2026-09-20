import { Link } from "react-router-dom";
import { Compass, Sparkles } from "lucide-react";

/**
 * "Auction not found" is used for genuinely missing rows AND for cases where
 * the Supabase client couldn't fetch (e.g. env not wired in preview). We
 * intentionally never surface technical config errors to the end user.
 */
export function NotFound() {
    return (
        <section
            data-testid="auction-not-found"
            className="mx-auto max-w-lg px-6 py-24 text-center"
        >
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.10)]">
                <Compass className="h-8 w-8 text-[hsl(var(--bz-purple))]" strokeWidth={1.5} />
                <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-[hsl(var(--bz-purple))]" />
            </div>
            <h1 className="mt-8 font-display text-3xl font-bold">
                Auction not found.
            </h1>
            <p className="mt-3 text-sm text-white/55">
                The listing you are looking for is not available anymore. It may have
                ended, been withdrawn, or never existed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                    to="/live"
                    data-testid="not-found-cta-live"
                    className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-primary px-6 py-3 text-sm font-semibold"
                >
                    Explore Live Auctions
                </Link>
                <Link
                    to="/"
                    data-testid="not-found-cta-home"
                    className="inline-flex items-center justify-center gap-2 rounded-full bz-btn-secondary px-6 py-3 text-sm font-semibold"
                >
                    Back to Home
                </Link>
            </div>
        </section>
    );
}
