import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * BIDZONE Phase 6.2 — OAuth return landing (/auth/callback).
 * supabase-js detects the PKCE code / access-token fragment and restores the
 * session automatically; we then honor the stored return destination.
 * Never fabricates success: an error in the URL is surfaced honestly.
 */
export default function AuthCallback() {
    const navigate = useNavigate();
    const { session, isLoading, consumeReturnTo } = useAuth();

    useEffect(() => {
        if (isLoading) return undefined;
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get("error_description") || params.get("error");
        const returnTo = consumeReturnTo();

        // PKCE cross-origin recovery: if we landed WITHOUT a session (exchange
        // was skipped — no code verifier at THIS origin, i.e. OAuth was started
        // on a sibling preview origin), bounce ONCE to the origin that owns the
        // verifier, preserving the full callback URL. Loop-guarded via
        // sessionStorage (per-origin, max one extra hop, no infinite ping-pong).
        if (!session && !oauthError) {
            let startOrigin = null;
            try {
                const m = document.cookie.match(/(?:^|;\s*)bz_oauth_start_origin=([^;]+)/);
                if (m) startOrigin = decodeURIComponent(m[1]);
            } catch {
                startOrigin = null;
            }
            const alreadyRecovered = sessionStorage.getItem("bz_oauth_recovered") === "1";
            if (
                startOrigin &&
                startOrigin !== window.location.origin &&
                !alreadyRecovered
            ) {
                try {
                    sessionStorage.setItem("bz_oauth_recovered", "1");
                } catch {
                    /* ignore */
                }
                window.location.replace(
                    `${startOrigin}/auth/callback${window.location.search}`
                );
                return undefined;
            }
        }

        const timer = setTimeout(() => {
            if (session && session.user) {
                toast.success("Signed in. Welcome to BIDZONE.");
                navigate(returnTo || "/", { replace: true });
            } else if (oauthError) {
                toast.error("Sign-in could not be completed", {
                    description: oauthError.slice(0, 140),
                });
                navigate("/", { replace: true });
            } else {
                navigate(returnTo || "/", { replace: true });
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [session, isLoading, consumeReturnTo, navigate]);

    return (
        <div
            data-testid="auth-callback"
            className="bz-ambient flex min-h-screen flex-col items-center justify-center gap-3 text-white/60"
        >
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--bz-purple))]" />
            <p className="text-sm">Completing sign-in…</p>
        </div>
    );
}
