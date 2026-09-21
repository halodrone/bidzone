import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "@/pages/Home";
import Landing from "@/pages/Landing";
import AuctionRoom from "@/pages/AuctionRoom";
import CreateAuction from "@/pages/CreateAuction";
import AuthCallback from "@/pages/AuthCallback";
import Wallet from "@/pages/Wallet";
import Profile from "@/pages/Profile";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { WalletProvider } from "@/context/WalletContext";
import { Loader2 } from "lucide-react";
import "@/App.css";

/**
 * Phase Polish 1 — logged-out visitors get the Landing page at "/",
 * returning authenticated users keep the existing Home / Discover
 * experience. Auth resolution is awaited (isLoading) so a signed-in
 * session never flashes the landing first.
 */
function LandingGate() {
    const { isLoading, isAuthed } = useAuth();
    if (isLoading) {
        return (
            <div className="bz-ambient flex min-h-screen items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--bz-purple))]" />
            </div>
        );
    }
    return isAuthed ? <Home /> : <Landing />;
}

function App() {
    return (
        <div className="App dark">
            <BrowserRouter>
                <AuthProvider>
                    <WalletProvider>
                        <Routes>
                            <Route path="/" element={<LandingGate />} />
                            <Route path="/auction/:auctionId" element={<AuctionRoom />} />
                            <Route path="/create" element={<CreateAuction />} />
                            <Route path="/wallet" element={<Wallet />} />
                            <Route path="/profile" element={<Profile />} />
                            <Route path="/auth/callback" element={<AuthCallback />} />
                            <Route path="*" element={<Home />} />
                        </Routes>
                    </WalletProvider>
                </AuthProvider>
            </BrowserRouter>
            <Toaster
                theme="dark"
                position="top-right"
                toastOptions={{
                    style: {
                        background: "hsl(240 8% 9%)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#fff",
                    },
                }}
            />
        </div>
    );
}

export default App;
