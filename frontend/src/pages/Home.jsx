import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { CategorySection } from "@/components/home/CategorySection";
import { LiveAuctionsSection } from "@/components/home/LiveAuctionsSection";
import { CreateAuctionCTA } from "@/components/home/CreateAuctionCTA";
import { Footer } from "@/components/home/Footer";

export default function Home() {
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
