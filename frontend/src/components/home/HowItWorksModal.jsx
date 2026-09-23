import { useEffect } from "react";
import { X } from "lucide-react";
import { HowItWorks } from "@/components/home/HowItWorks";

/**
 * BIDZONE — How It Works modal (Home / main app only).
 *
 * Wraps the existing <HowItWorks /> section content — no duplication.
 * Behavior:
 *  • Centered scrollable card + translucent backdrop
 *  • X button + backdrop click + Escape key close
 *  • Body scroll locked while open, restored on close
 *  • Fits inside 360 / 390px viewports safely, wraps long text
 *  • Modal content scrolls INSIDE the card
 */
export function HowItWorksModal({ open, onClose }) {
    useEffect(() => {
        if (!open) return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            data-testid="hiw-modal-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hiw-modal-title"
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto sm:items-center"
        >
            {/* Backdrop */}
            <button
                type="button"
                aria-label="Close How It Works"
                data-testid="hiw-modal-backdrop"
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
            />

            {/* Card — scrollable, mobile-safe */}
            <div
                data-testid="hiw-modal-card"
                className="relative z-10 my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-[900px] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[hsl(var(--bz-surface))] shadow-2xl shadow-black/60 mx-3 sm:mx-4"
            >
                {/* Close button — always visible */}
                <button
                    type="button"
                    onClick={onClose}
                    data-testid="hiw-modal-close"
                    aria-label="Close"
                    className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition hover:border-[hsl(var(--bz-purple)/0.5)] hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>

                {/* Scrollable content — reuses the existing HowItWorks section */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <span id="hiw-modal-title" className="sr-only">How BIDZONE works</span>
                    <HowItWorks />
                </div>
            </div>
        </div>
    );
}
