import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "@/pages/Home";
import AuctionRoom from "@/pages/AuctionRoom";
import "@/App.css";

function App() {
    return (
        <div className="App dark">
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/auction/:auctionId" element={<AuctionRoom />} />
                    <Route path="*" element={<Home />} />
                </Routes>
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
