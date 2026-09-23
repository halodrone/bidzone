import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveMediaUrls } from "@/lib/storage";

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
export function useLiveAuctions(filter = "live", limit = 12, category = "", search = "") {
    return useQuery({
        queryKey: ["home-auctions", filter, limit, category, search],
        enabled: isSupabaseConfigured,
        staleTime: 15_000,
        refetchInterval: 30_000,
        queryFn: async () => {
            if (!supabase) return [];

            const base = supabase
                .from("auctions")
                .select(
                    `
                    id, title, description, category, condition, auction_type, status,
                    starting_bid, current_bid, minimum_increment, end_time,
                    seller:profiles!auctions_seller_id_fkey (
                        id, username, display_name, avatar_url, reputation_score
                    ),
                    auction_items ( media_url, media_type, sort_order )
                    `
                )
                .limit(limit);

            let q = base;
            if (category) q = q.eq("category", category);
            const keyword = search.trim().slice(0, 80).replace(/[\\%_(),]/g, " ").replace(/\s+/g, " ");
            if (keyword) q = q.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,category.ilike.%${keyword}%`);
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
            // Phase 6.1: resolve private-bucket storage paths to signed URLs
            return await Promise.all(
                (data ?? []).map(async (a) => ({
                    ...a,
                    auction_items: await resolveMediaUrls(a.auction_items),
                }))
            );
        },
    });
}
