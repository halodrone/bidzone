import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { CategorySection } from "@/components/home/CategorySection";
import { LiveAuctionsSection } from "@/components/home/LiveAuctionsSection";
import { CreateAuctionCTA } from "@/components/home/CreateAuctionCTA";
import { Footer } from "@/components/home/Footer";

export default function Home() {
    const location = useLocation();

    // Functional navigation: "Live Zone" / "Explore" / category cards link here
    // with ?tab= / ?category= (and/or #live-auctions); the landing's
    // "How It Works" link arrives via #how-it-works. Scroll the requested
    // section into view once it has mounted so the destination is visible.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const hasTarget =
            location.hash === "#live-auctions" ||
            location.hash === "#how-it-works" ||
            params.has("tab") ||
            params.has("category");
        if (!hasTarget) return undefined;
        const id =
            location.hash === "#how-it-works"
                ? "how-it-works"
                : "live-auctions";
        const t = setTimeout(() => {
            document
                .getElementById(id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 350);
        return () => clearTimeout(t);
    }, [location.hash, location.search]);

    return (
        <div data-testid="page-home" className="bz-ambient min-h-screen">
            <Header />
            <main>
                <Hero />
                <HowItWorks />
                <CategorySection />
                <LiveAuctionsSection />
                <CreateAuctionCTA />
            </main>
            <Footer />
        </div>
    );
}
