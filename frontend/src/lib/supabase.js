import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for BIDZONE.
 *
 * Reads credentials from the frontend env:
 *   REACT_APP_SUPABASE_URL
 *   REACT_APP_SUPABASE_ANON_KEY
 *
 * When either is missing (e.g. before the Supabase project is wired in for
 * this preview), we DELIBERATELY export `null`. Every consumer must handle
 * the `null` case and fall through to the polished empty state — we never
 * fabricate auction/user/bid data.
 */
const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase =
    url && key
        ? createClient(url, key, {
              auth: { persistSession: true, autoRefreshToken: true },
          })
        : null;

export const isSupabaseConfigured = Boolean(supabase);
