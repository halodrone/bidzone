import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { resolveMediaUrls } from "@/lib/storage";

/**
 * Load an auction with its seller and media items.
 * Returns { data, isLoading, isError, notFound }.
 * When Supabase isn't reachable OR the auction doesn't exist, `notFound=true`
 * so the caller can render the polished "Auction not found" state — the user
 * never sees a technical error message.
 */
export function useAuction(auctionId) {
    const q = useQuery({
        queryKey: ["auction", auctionId],
        enabled: Boolean(auctionId),
        staleTime: 15_000,
        retry: false,
        queryFn: async () => {
            if (!supabase) throw new Error("NOT_FOUND");
            const { data, error } = await supabase
                .from("auctions")
                .select(
                    `
                    id, title, description, category, condition, auction_type, status,
                    starting_bid, current_bid, minimum_increment,
                    start_time, end_time, anti_sniping_seconds, closed_at,
                    allowed_regions,
                    seller:profiles!auctions_seller_id_fkey (
                        id, username, display_name, avatar_url, reputation_score, wallet_address
                    ),
                    auction_items ( id, media_url, media_type, sort_order )
                    `
                )
                .eq("id", auctionId)
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("NOT_FOUND");
            // Phase 6.1: resolve private-bucket storage paths to signed URLs
            return {
                ...data,
                auction_items: await resolveMediaUrls(data.auction_items),
            };
        },
    });

    const notFound = q.isError || (q.isFetched && !q.data);
    return { ...q, notFound };
}

/**
 * Public bid history for an auction. Real rows only.
 */
export function useAuctionBids(auctionId, { limit = 40 } = {}) {
    return useQuery({
        queryKey: ["auction-bids", auctionId],
        enabled: Boolean(auctionId) && Boolean(supabase),
        staleTime: 10_000,
        queryFn: async () => {
            const { data, error, count } = await supabase
                .from("bids")
                .select("id, amount, wallet_address, status, created_at, bidder_id", {
                    count: "exact",
                })
                .eq("auction_id", auctionId)
                .order("amount", { ascending: false })
                .order("created_at", { ascending: true })
                .limit(limit);
            if (error) throw error;
            return { rows: data ?? [], count: count ?? (data?.length ?? 0) };
        },
    });
}

/**
 * Public comments for an auction.
 */
export function useAuctionComments(auctionId, { limit = 50 } = {}) {
    return useQuery({
        queryKey: ["auction-comments", auctionId],
        enabled: Boolean(auctionId) && Boolean(supabase),
        staleTime: 10_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("comments")
                .select(
                    `
                    id, message, created_at, user_id,
                    user:profiles!comments_user_id_fkey ( username, display_name, avatar_url, wallet_address )
                    `
                )
                .eq("auction_id", auctionId)
                .order("created_at", { ascending: false })
                .limit(limit);
            if (error) throw error;
            return data ?? [];
        },
    });
}

/**
 * Public reactions for an auction, grouped by type.
 */
export function useAuctionReactions(auctionId) {
    return useQuery({
        queryKey: ["auction-reactions", auctionId],
        enabled: Boolean(auctionId) && Boolean(supabase),
        staleTime: 10_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("reactions")
                .select("reaction_type, user_id, created_at")
                .eq("auction_id", auctionId);
            if (error) throw error;
            const rows = data ?? [];
            const byType = rows.reduce((acc, r) => {
                acc[r.reaction_type] = (acc[r.reaction_type] ?? 0) + 1;
                return acc;
            }, {});
            return { rows, byType, total: rows.length };
        },
    });
}

/**
 * Subscribes to Supabase Realtime channels so the room refreshes when
 * `bids`, `comments`, `reactions`, or the `auctions` row itself changes.
 * On each event we invalidate the corresponding React-Query cache — the
 * page then re-fetches trusted server-side rows.  We never mutate state
 * from the payload directly.
 */
export function useAuctionRealtime(auctionId) {
    const qc = useQueryClient();

    useEffect(() => {
        if (!supabase || !auctionId) return undefined;

        const channel = supabase
            .channel(`auction:${auctionId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "bids",
                  filter: `auction_id=eq.${auctionId}` },
                () => qc.invalidateQueries({ queryKey: ["auction-bids", auctionId] })
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "comments",
                  filter: `auction_id=eq.${auctionId}` },
                () => qc.invalidateQueries({ queryKey: ["auction-comments", auctionId] })
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "reactions",
                  filter: `auction_id=eq.${auctionId}` },
                () => qc.invalidateQueries({ queryKey: ["auction-reactions", auctionId] })
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "auctions",
                  filter: `id=eq.${auctionId}` },
                () => qc.invalidateQueries({ queryKey: ["auction", auctionId] })
            )
            .subscribe();

        return () => {
            try {
                supabase.removeChannel(channel);
            } catch {
                /* ignore cleanup errors */
            }
        };
    }, [auctionId, qc]);
}

/**
 * Small helpers exposed for components.
 */
export function useMinimumNextBid(auction) {
    return useMemo(() => {
        if (!auction) return null;
        const inc = auction.minimum_increment;
        if (!auction.current_bid) return auction.starting_bid ?? inc ?? "0";
        // Both fields are Numeric(38,18) → strings. Use string-safe addition via BigInt.
        return addDecimals(auction.current_bid, inc);
    }, [auction]);
}

// String-safe addition for Numeric(38,18) values (stored as strings).
export function addDecimals(a, b, scale = 18) {
    const norm = (v) => {
        const [i, f = ""] = String(v ?? "0").split(".");
        const frac = (f + "0".repeat(scale)).slice(0, scale);
        return BigInt((i.startsWith("-") ? i : i.replace(/^0+(?=\d)/, "")) + frac);
    };
    const sum = norm(a) + norm(b);
    const s = sum.toString().padStart(scale + 1, "0");
    const iPart = s.slice(0, s.length - scale) || "0";
    const fPart = s.slice(s.length - scale).replace(/0+$/, "");
    return fPart.length ? `${iPart}.${fPart}` : iPart;
}

// String-safe comparison for Numeric(38,18): returns -1 | 0 | 1.
// Never uses JavaScript floating-point arithmetic.
export function compareDecimals(a, b, scale = 18) {
    const norm = (v) => {
        const [i, f = ""] = String(v ?? "0").split(".");
        const frac = (f + "0".repeat(scale)).slice(0, scale);
        return BigInt((i.startsWith("-") ? i : i.replace(/^0+(?=\d)/, "")) + frac);
    };
    const x = norm(a);
    const y = norm(b);
    return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Phase 6.4 — submit an APPLICATION-LEVEL bid (no blockchain transaction).
 * The server (tg_validate_bid + tg_after_bid_insert) remains fully
 * authoritative: LIVE/window/seller/min-increment validation, current_bid
 * update, anti-sniping extension, and outbid/won notifications all happen
 * inside the database. The client never touches current_bid/status/end_time.
 */
export async function submitBid({ auctionId, bidderId, amount, walletAddress }) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data, error } = await supabase
        .from("bids")
        .insert({
            auction_id: auctionId,
            bidder_id: bidderId,
            wallet_address: walletAddress || null,
            amount,
            status: "ACTIVE",
        })
        .select("id, amount, status, created_at")
        .single();
    if (error) {
        // Surface the database's own validation messages (e.g.
        // BID_BELOW_MINIMUM, AUCTION_NOT_LIVE, SELLER_CANNOT_BID) verbatim —
        // they are already user-appropriate and honest.
        throw new Error(error.message || "Bid rejected");
    }
    return data;
}
