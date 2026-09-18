import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import "@/App.css";

function App() {
    return (
        <div className="App dark">
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </BrowserRouter>
        </div>
    );
}

export default App;
