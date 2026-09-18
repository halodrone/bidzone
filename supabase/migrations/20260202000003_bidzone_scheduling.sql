-- =============================================================================
-- BIDZONE — Phase 4.2 scheduled jobs (pg_cron)
--
-- Supabase supports pg_cron. On a hosted Supabase project you MUST enable the
-- extension from the dashboard (Database → Extensions → pg_cron → Enable)
-- BEFORE this migration will succeed. If pg_cron is not enabled, this file
-- fails safely without applying any schedule.
--
-- If you cannot enable pg_cron for policy reasons, an equivalent external
-- schedule is documented at the bottom of this file (Supabase Cron / external
-- cron hitting an edge function that calls the same RPCs).
-- =============================================================================

do $$
begin
    if not exists (select 1 from pg_extension where extname = 'pg_cron') then
        raise notice
          'pg_cron is NOT enabled in this database. Skipping schedule creation. '
          'Enable pg_cron in Supabase (Database → Extensions → pg_cron) and '
          're-run this migration, OR configure equivalent external schedules '
          'as documented in the file header.';
        return;
    end if;

    -- A) Close expired LIVE auctions — every 15 seconds.
    perform cron.schedule(
        'bidzone_close_expired_auctions',
        '15 seconds',
        $cron$ select public.close_expired_auctions(); $cron$
    );

    -- B) Detect seller shipping-deadline breaches — every minute.
    perform cron.schedule(
        'bidzone_check_ship_deadlines',
        '1 minute',
        $cron$ select public.check_ship_deadlines(); $cron$
    );

    -- C) 48-hour auto-release when buyer took no action — every minute.
    --    (Confirmation window starts inside update_shipping_tracking when
    --    tracking_status becomes DELIVERED, so no separate "start" job is
    --    required — this cron only enforces the deadline.)
    perform cron.schedule(
        'bidzone_check_auto_releases',
        '1 minute',
        $cron$ select public.check_auto_releases(); $cron$
    );
end;
$$;

-- =============================================================================
-- Manual configuration required if pg_cron is unavailable
-- =============================================================================
-- 1. Supabase Cron (dashboard → Database → Cron Jobs), OR any external
--    scheduler (GitHub Actions, cron-job.org, etc.) that can POST to a
--    Supabase Edge Function with the service-role JWT.
--
-- 2. Create ONE edge function `bidzone-tick` that calls, in order:
--
--       await sb.rpc('close_expired_auctions');
--       await sb.rpc('check_ship_deadlines');
--       await sb.rpc('check_auto_releases');
--
-- 3. Schedule the edge function to run every 15–60 seconds.
--
-- All three RPCs are idempotent (state guards + row locks + SKIP LOCKED),
-- so overlap between runs is safe.
-- =============================================================================
