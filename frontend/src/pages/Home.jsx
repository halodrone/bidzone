import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { CategorySection } from "@/components/home/CategorySection";
import { LiveAuctionsSection } from "@/components/home/LiveAuctionsSection";
import { CreateAuctionCTA } from "@/components/home/CreateAuctionCTA";
import { Footer } from "@/components/home/Footer";

export default function Home() {
    const location = useLocation();

    // Functional navigation: "Live Zone" / "Explore" / category cards link here
    // with ?tab= / ?category= (and/or #live-auctions). Scroll the live listing
    // into view once it has mounted so the destination is actually visible.
    useEffect(() => {
        const hasTarget =
            location.hash === "#live-auctions" ||
            new URLSearchParams(location.search).has("tab") ||
            new URLSearchParams(location.search).has("category");
        if (!hasTarget) return undefined;
        const t = setTimeout(() => {
            document
                .getElementById("live-auctions")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 350);
        return () => clearTimeout(t);
    }, [location.hash, location.search]);

    return (
        <div data-testid="page-home" className="bz-ambient min-h-screen">
            <Header />
            <main>
                <Hero />
                <CategorySection />
                <LiveAuctionsSection />
                <CreateAuctionCTA />
            </main>
            <Footer />
        </div>
    );
}
