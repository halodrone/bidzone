import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "@/pages/Home";
import AuctionRoom from "@/pages/AuctionRoom";
import CreateAuction from "@/pages/CreateAuction";
import AuthCallback from "@/pages/AuthCallback";
import Wallet from "@/pages/Wallet";
import { AuthProvider } from "@/context/AuthContext";
import { WalletProvider } from "@/context/WalletContext";
import "@/App.css";

function App() {
    return (
        <div className="App dark">
            <BrowserRouter>
                <AuthProvider>
                    <WalletProvider>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/auction/:auctionId" element={<AuctionRoom />} />
                            <Route path="/create" element={<CreateAuction />} />
                            <Route path="/wallet" element={<Wallet />} />
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
