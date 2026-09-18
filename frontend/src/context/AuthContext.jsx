import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
