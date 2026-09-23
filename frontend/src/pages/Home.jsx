import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { HowItWorksModal } from "@/components/home/HowItWorksModal";
import { CategorySection } from "@/components/home/CategorySection";
import { LiveAuctionsSection } from "@/components/home/LiveAuctionsSection";
import { CreateAuctionCTA } from "@/components/home/CreateAuctionCTA";
import { Footer } from "@/components/home/Footer";

export default function Home() {
    const location = useLocation();
    const navigate = useNavigate();
    const [hiwOpen, setHiwOpen] = useState(false);

    // Functional navigation:
    //  • ?tab= / ?category= or #live-auctions → smooth-scroll to Live Auctions
    //  • #how-it-works → open the How It Works modal (no scroll, no separate route)
    // The hash is consumed and cleared so re-opening still works after close.
    useEffect(() => {
        const params = new URLSearchParams(location.search);

        if (location.hash === "#how-it-works") {
            setHiwOpen(true);
            navigate({ pathname: location.pathname, search: location.search, hash: "" }, { replace: true });
            return undefined;
        }

        const hasTarget =
            location.hash === "#live-auctions" ||
            params.has("tab") ||
            params.has("category");
        if (!hasTarget) return undefined;
        const t = setTimeout(() => {
            document
                .getElementById("live-auctions")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 350);
        return () => clearTimeout(t);
    }, [location.hash, location.search, location.pathname, navigate]);

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
            <HowItWorksModal open={hiwOpen} onClose={() => setHiwOpen(false)} />
        </div>
    );
}
