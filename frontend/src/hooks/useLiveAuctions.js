import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Fetch auctions for the Home page.
 *
 * Filters:
 *   'live'        — status = LIVE, ordered by end_time asc
 *   'ending-soon' — status = LIVE, end_time within next 60m, asc
 *   'trending'    — status = LIVE, ordered by current_bid desc nulls last
 *   'all'         — status IN (SCHEDULED, LIVE), asc
 *
 * When Supabase is not configured, returns { data: [], isConfigured: false }
 * so the Home page renders its polished empty state.
 * We never fabricate auction rows.
 */
export function useLiveAuctions(filter = "live", limit = 12) {
    return useQuery({
        queryKey: ["home-auctions", filter, limit],
        enabled: isSupabaseConfigured,
        staleTime: 15_000,
        refetchInterval: 30_000,
        queryFn: async () => {
            if (!supabase) return [];

            const base = supabase
                .from("auctions")
                .select(
                    `
                    id, title, category, condition, auction_type, status,
                    starting_bid, current_bid, minimum_increment, end_time,
                    seller:profiles!auctions_seller_id_fkey (
                        id, username, display_name, avatar_url, reputation_score
                    ),
                    auction_items ( media_url, media_type, sort_order )
                    `
                )
                .limit(limit);

            let q = base;
            if (filter === "live") {
                q = q.eq("status", "LIVE").order("end_time", { ascending: true });
            } else if (filter === "ending-soon") {
                const cutoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                q = q
                    .eq("status", "LIVE")
                    .lte("end_time", cutoff)
                    .order("end_time", { ascending: true });
            } else if (filter === "trending") {
                q = q
                    .eq("status", "LIVE")
                    .order("current_bid", { ascending: false, nullsFirst: false });
            } else {
                q = q
                    .in("status", ["SCHEDULED", "LIVE"])
                    .order("end_time", { ascending: true, nullsFirst: false });
            }

            const { data, error } = await q;
            if (error) throw error;
            return data ?? [];
        },
    });
}
