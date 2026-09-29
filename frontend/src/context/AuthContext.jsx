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

        const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
            setSession(s || null);
            // CRITICAL cache isolation: on any auth transition (sign-in,
            // sign-out, token refresh with a different subject, user switch),
            // wipe every react-query cache. The safer alternative — invalidating
            // by known key prefixes — is fragile: any user-scoped query that
            // slipped in without a user id in its key would leak the previous
            // user's rows into the new user's view (the reported My Activity
            // isolation bug). Full reset is O(cache-size) and only runs on
            // auth transitions, so cost is negligible.
            if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
                try {
                    qc.removeQueries();
                } catch {
                    /* non-fatal */
                }
            }
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
                .select("id, username, display_name, avatar_url, reputation_score, wallet_address, is_admin")
                .eq("id", user.id)
                .maybeSingle();
            // is_admin is opt-in; missing column (fresh env before migration)
            // must fail silently to false instead of breaking the profile query.
            if (error && !/is_admin|column|schema/i.test(error.message || "")) throw error;
            if (error) {
                const { data: fallback } = await supabase
                    .from("profiles")
                    .select("id, username, display_name, avatar_url, reputation_score, wallet_address")
                    .eq("id", user.id)
                    .maybeSingle();
                return fallback ? { ...fallback, is_admin: false } : null;
            }
            return data || null;
        },
    });

    /**
     * Profile self-heal (username regression fix, Nov 2026).
     *
     * The historical `handle_new_user()` DB trigger only inserts the row `id`
     * and never copies Google metadata (`raw_user_meta_data.full_name` / `name`)
     * into `profiles.display_name`. As a result every profile in the DB has
     * `display_name = NULL` and `username = NULL`, and any UI surface that
     * shows a name for a user OTHER than the current viewer (auction seller
     * on the detail page, comment author in the Chat panel, etc.) has no
     * data to render and falls back to the generic "User" label.
     *
     * Fixing the DB trigger requires a migration; we cannot push one from the
     * client without service-role credentials. So instead we self-heal the
     * signed-in user's OWN profile row on every sign-in: RLS allows a user to
     * UPDATE their own `profiles` row, so we derive a display_name from
     * Google metadata (or from the email local-part as a stable fallback)
     * and persist it. Over the next few sign-ins, every real (Google) account
     * ends up with a real display_name, and all downstream surfaces render
     * correctly — no schema change, no RLS weakening, no auth change.
     *
     * Idempotent: only fires when profile is loaded AND at least one of the
     * two fields is still null. Silently ignores update failures (they will
     * be retried on the next sign-in).
     */
    useEffect(() => {
        if (!supabase || !user || !profileQuery.data) return undefined;
        const p = profileQuery.data;
        const emailLocal =
            (user.email || "").split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 32);
        const metaName =
            (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || "";
        const desiredDisplay = String(metaName || emailLocal || "").trim();
        const desiredUsername = emailLocal || "";
        const patch = {};
        if (!p.display_name && desiredDisplay) patch.display_name = desiredDisplay;
        if (!p.username && desiredUsername) patch.username = desiredUsername;
        if (Object.keys(patch).length === 0) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const { error } = await supabase
                    .from("profiles")
                    .update(patch)
                    .eq("id", user.id);
                if (error) return; // best-effort; unique constraint on username handled next sign-in
                if (cancelled) return;
                // Refresh caches that render this profile so the new name is
                // visible immediately (no F5 required).
                qc.invalidateQueries({ queryKey: ["profile", user.id] });
                qc.invalidateQueries({ queryKey: ["auction"] });
                qc.invalidateQueries({ queryKey: ["live-auctions"] });
                qc.invalidateQueries({ queryKey: ["auction-comments"] });
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [user, profileQuery.data, qc]);

    const signInWithGoogle = useCallback(async () => {
        if (!supabase) throw new Error("Supabase is not configured");
        // PKCE verifier is ORIGIN-SCOPED (localStorage). The Emergent preview can
        // serve the app on sibling origins (*.preview.emergentagent.com and
        // *.preview.static.emergentagent.com) while the Supabase Site URL (the
        // fixed OAuth landing) is one specific origin. If the user starts OAuth
        // on one sibling and lands on the other, the verifier is absent and
        // supabase-js silently skips the code exchange -> signed out forever.
        // Record the origin that owns the verifier in a parent-domain cookie so
        // AuthCallback can re-land the callback on the correct origin. No-ops
        // when start origin == landing origin (normal single-origin setups).
        try {
            const host = window.location.hostname;
            const parentDomain = host.split(".").slice(-2).join(".");
            document.cookie = `bz_oauth_start_origin=${encodeURIComponent(window.location.origin)}; domain=.${parentDomain}; max-age=600; path=/; SameSite=Lax`;
        } catch {
            /* non-fatal: recovery simply won't be possible */
        }
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
        // Nuke every cached query so no previous-user data can be re-rendered
        // between the signOut resolution and the next SIGNED_OUT event.
        try {
            qc.removeQueries();
        } catch {
            /* non-fatal */
        }
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
