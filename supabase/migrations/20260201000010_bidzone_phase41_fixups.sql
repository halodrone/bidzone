-- =============================================================================
-- BIDZONE — Phase 4.1 Fix-up
-- Applies approvals: (3) auction field protection, (4) anti-sniping default = 10.
-- Items 1, 2, 5, 6, 7, 8 = KEEP (no change). Item 9 handled by removing seed file
-- from the migrations directory (done outside SQL).
-- =============================================================================

-- =============================================================================
-- Item 4 — Anti-sniping default = 10 seconds
-- =============================================================================
-- New DRAFT auctions default to 10s anti-sniping. Existing rows keep whatever
-- they already have. The auction rule (bid in final 10s → extend by 10s) is
-- ALREADY implemented in tg_after_bid_insert:
--   if (end_time - now()) < make_interval(secs => anti_sniping_seconds)
--   then end_time := now() + make_interval(secs => anti_sniping_seconds)
-- With anti_sniping_seconds = 10, this is exactly "final 10s → +10s". No
-- change to the trigger is needed.
alter table public.auctions
    alter column anti_sniping_seconds set default 10;

-- =============================================================================
-- Item 3 — BEFORE UPDATE protection on public.auctions
-- =============================================================================
-- Once an auction leaves DRAFT, the seller (or any direct client) cannot modify:
--     starting_bid, minimum_increment, anti_sniping_seconds, current_bid, end_time
--
-- Legitimate system writes (the tg_after_bid_insert trigger extending end_time
-- and setting current_bid) are preserved by detecting nested trigger depth via
-- pg_trigger_depth() > 1. When the auctions BEFORE UPDATE fires because a
-- higher-level trigger (e.g., tg_after_bid_insert on bids) issued the UPDATE,
-- depth is >= 2 and the guard yields.
--
-- Service-role backfills that must legitimately bypass this guard (rare admin
-- fixes) can do so with:  SET LOCAL session_replication_role = 'replica';
-- =============================================================================
create or replace function public.tg_protect_auction_fields()
returns trigger
language plpgsql
as $$
begin
    -- Nested trigger invocation (e.g., bid after-trigger updating end_time /
    -- current_bid). Allow it through.
    if pg_trigger_depth() > 1 then
        return new;
    end if;

    -- All lifecycle-locked fields are only mutable while status = 'DRAFT'.
    if old.status <> 'DRAFT' then
        if new.starting_bid is distinct from old.starting_bid then
            raise exception 'AUCTION_FIELD_LOCKED: starting_bid cannot change after DRAFT (was %, tried %)',
                old.starting_bid, new.starting_bid
                using errcode = 'check_violation';
        end if;

        if new.minimum_increment is distinct from old.minimum_increment then
            raise exception 'AUCTION_FIELD_LOCKED: minimum_increment cannot change after DRAFT (was %, tried %)',
                old.minimum_increment, new.minimum_increment
                using errcode = 'check_violation';
        end if;

        if new.anti_sniping_seconds is distinct from old.anti_sniping_seconds then
            raise exception 'AUCTION_FIELD_LOCKED: anti_sniping_seconds cannot change after DRAFT (was %, tried %)',
                old.anti_sniping_seconds, new.anti_sniping_seconds
                using errcode = 'check_violation';
        end if;

        if new.current_bid is distinct from old.current_bid then
            raise exception 'AUCTION_FIELD_LOCKED: current_bid is managed by the bid system only'
                using errcode = 'check_violation';
        end if;

        if new.end_time is distinct from old.end_time then
            raise exception 'AUCTION_FIELD_LOCKED: end_time is managed by the auction system (anti-sniping) only'
                using errcode = 'check_violation';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists protect_auction_fields on public.auctions;
create trigger protect_auction_fields
    before update on public.auctions
    for each row execute function public.tg_protect_auction_fields();

-- =============================================================================
-- End of Phase 4.1 fix-up
-- =============================================================================
