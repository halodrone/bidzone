import { useState } from "react";
import { toast } from "sonner";
import { X, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * BIDZONE Phase 6.2 — Google-only sign-in modal.
 * No email/password, no fake success: if the Google provider is not yet
 * configured on the Supabase project, the real error is surfaced honestly.
 */
export function AuthModal({ open, onClose }) {
    const { signInWithGoogle, supabaseUrl, supabaseApiKey } = useAuthMeta();
    const [pending, setPending] = useState(false);

    if (!open) return null;

    async function handleGoogle() {
        setPending(true);
        try {
            // Pre-flight (official endpoint): /auth/v1/settings lists the
            // enabled external providers. When Google is not yet configured
            // on the Supabase project we surface an honest, friendly message
            // INSTEAD of redirecting the user to a raw 400 error page.
            const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
                headers: { apikey: supabaseApiKey() },
            });
            if (res.ok) {
                const settings = await res.json();
                const googleEnabled = Boolean(
                    settings &&
                        settings.external &&
                        settings.external.google === true
                );
                if (!googleEnabled) {
                    toast.error("Google sign-in is not configured yet", {
                        description:
                            "The Google provider has not been enabled for this BIDZONE project. Connect it in the Supabase dashboard (Auth → Providers → Google).",
                    });
                    setPending(false);
                    return;
                }
            }
            await signInWithGoogle();
            // On success the browser is redirected to /auth/callback — no
            // navigation needed here.
        } catch (e) {
            toast.error("Google sign-in is not available right now", {
                description:
                    (e && e.message) ||
                    "Please try again shortly.",
            });
            setPending(false);
        }
    }

    return (
        <div
            data-testid="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
            className="fixed inset-0 z-[70] flex items-center justify-center px-4"
        >
            <button
                type="button"
                aria-label="Close sign in"
                data-testid="auth-modal-backdrop"
                onClick={onClose}
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            />
            <div className="relative w-full max-w-sm rounded-3xl bz-card p-8 text-center">
                <button
                    type="button"
                    aria-label="Close"
                    data-testid="auth-modal-close"
                    onClick={onClose}
                    className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/60 hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>

                <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--bz-surface))] border border-white/10">
                    <Sparkles className="h-5 w-5 text-[hsl(var(--bz-purple))]" strokeWidth={2.5} />
                </span>
                <h2 className="font-display text-2xl font-bold">Sign in / Get Started</h2>
                <p className="mt-2 text-sm text-white/50">
                    Join live auctions, bid, and sell — one identity across BIDZONE.
                </p>

                <button
                    type="button"
                    data-testid="auth-google-button"
                    disabled={pending}
                    onClick={handleGoogle}
                    className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                    <GoogleG /> {pending ? "Redirecting to Google…" : "Continue with Google"}
                </button>

                <p className="mt-4 text-[11px] leading-relaxed text-white/35">
                    Secured by Supabase Auth. We never see or store your Google password.
                </p>
            </div>
        </div>
    );
}

function useAuthMeta() {
    const { signInWithGoogle } = useAuth();
    return {
        signInWithGoogle,
        supabaseUrl: supabase ? supabase.supabaseUrl : "",
        supabaseApiKey: () => (supabase ? supabase.supabaseKey : ""),
    };
}

function GoogleG() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
    );
}
