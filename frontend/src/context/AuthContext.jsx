import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { AuthModal } from "@/components/auth/AuthModal";

/**
 * BIDZONE Phase 6.2 — Google-only authentication via Supabase Auth.
 *
 * - signInWithOAuth('google') — Supabase performs the Google handshake
 *   server-side; real Google credentials are configured later in the
 *   Supabase dashboard (Auth → Providers → Google) with ZERO code change.
 * - Session persistence is handled by supabase-js (localStorage,
 *   autoRefreshToken) and mirrored into React state via onAuthStateChange.
 * - profiles.id = auth.users.id is preserved: the on_auth_user_created
 *   trigger (Phase 4.1) auto-creates the profile row — never fabricated.
 * - Protected actions (Create Auction, Bidding) call openAuthModal() when
 *   unauthenticated — the BIDZONE auth UI, never a crash.
 */

const RETURN_TO_KEY = "bz_auth_return_to";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [initialized, setInitialized] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const qc = useQueryClient();

    useEffect(() => {
        if (!supabase) {
            setInitialized(true);
            return undefined;
        }

        let mounted = true;
        supabase.auth.getSession().then(({ data }) => {
            if (!mounted) return;
            setSession(data && data.session ? data.session : null);
            setInitialized(true);
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s || null);
        });

        return () => {
            mounted = false;
            if (sub && sub.subscription) sub.subscription.unsubscribe();
        };
    }, []);

    // OAuth fallback recovery — GoTrue redirects to the configured Site URL
    // (NOT to our redirectTo) whenever the OAuth callback cannot be resolved:
    // expired/unknown state, failed code exchange, etc. The browser then
    // lands on the app root with ?error=...&error_code=...&error_description=...
    // params (plus a matching #error=... fragment). Surface that honestly with
    // a friendly retry toast and clean the URL instead of a silent dead end.
    // /auth/callback is skipped — AuthCallback.jsx owns error handling there.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const errorCode = params.get("error_code") || params.get("error");
        const errorDescription = params.get("error_description");
        if (!errorCode && !errorDescription) return undefined;
        if (window.location.pathname === "/auth/callback") return undefined;

        const detail = (errorDescription || `OAuth error: ${errorCode}`).slice(0, 140);
        toast.error("Sign-in could not be completed", {
            description: `${detail} — please try signing in again.`,
        });

        params.delete("error");
        params.delete("error_code");
        params.delete("error_description");
        params.delete("state");
        const qs = params.toString();
        const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
        window.history.replaceState({}, "", cleanUrl);
        if (window.location.hash && window.location.hash.indexOf("error") !== -1) {
            window.history.replaceState({}, "", cleanUrl);
        }
        return undefined;
    }, []);

    const user = session && session.user ? session.user : null;

    const profileQuery = useQuery({
        queryKey: ["profile", user ? user.id : null],
        enabled: Boolean(supabase) && Boolean(user),
        staleTime: 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, username, display_name, avatar_url, reputation_score, wallet_address")
                .eq("id", user.id)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        },
    });

    const signInWithGoogle = useCallback(async () => {
        if (!supabase) throw new Error("Supabase is not configured");
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) throw error;
    }, []);

    const signOut = useCallback(async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        qc.removeQueries({ queryKey: ["profile"] });
    }, [qc]);

    const openAuthModal = useCallback((opts) => {
        const returnTo = opts && opts.returnTo ? opts.returnTo : null;
        if (returnTo) {
            try {
                sessionStorage.setItem(RETURN_TO_KEY, returnTo);
            } catch {
                /* ignore */
            }
        }
        setModalOpen(true);
    }, []);

    const closeAuthModal = useCallback(() => setModalOpen(false), []);

    const consumeReturnTo = useCallback(() => {
        try {
            const v = sessionStorage.getItem(RETURN_TO_KEY);
            sessionStorage.removeItem(RETURN_TO_KEY);
            return v || null;
        } catch {
            return null;
        }
    }, []);

    const value = useMemo(
        () => ({
            session,
            user,
            profile: profileQuery.data || null,
            isLoading: !initialized,
            isAuthed: Boolean(user),
            signInWithGoogle,
            signOut,
            openAuthModal,
            closeAuthModal,
            consumeReturnTo,
        }),
        [session, user, profileQuery.data, initialized, signInWithGoogle, signOut, openAuthModal, closeAuthModal, consumeReturnTo]
    );

    return React.createElement(
        AuthContext.Provider,
        { value },
        children,
        React.createElement(AuthModal, {
            open: modalOpen,
            onClose: closeAuthModal,
        })
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}

export { RETURN_TO_KEY };
