-- =============================================================================
-- BIDZONE — Phase 4.2 lifecycle: additive schema
-- Rule from user: "Do not recreate or modify the Phase 4.1 database schema
-- unless absolutely necessary." All changes here are ADDITIVE (new columns,
-- new index, no drops, no enum changes).
-- =============================================================================

-- Idempotency + audit stamp for the auction closer.
alter table public.auctions
    add column if not exists closed_at timestamptz;

-- Post-sale timing for the escrow-driven lifecycle.
alter table public.escrow_transactions
    add column if not exists funded_at             timestamptz,
    add column if not exists ship_by               timestamptz,
    add column if not exists confirmation_deadline timestamptz,
    add column if not exists released_at           timestamptz,
    add column if not exists refunded_at           timestamptz,
    add column if not exists dispute_id            uuid references public.disputes(id) on delete set null;

-- Shipping deadline snapshot (also stored on escrow for direct cron queries).
alter table public.shipping
    add column if not exists ship_by timestamptz;

-- Idempotent notifications: unique per (user, dedup_key).
alter table public.notifications
    add column if not exists dedup_key text;

create unique index if not exists notifications_user_dedup_uidx
    on public.notifications (user_id, dedup_key)
    where dedup_key is not null;

-- Fast cron scans.
create index if not exists escrow_ship_by_idx
    on public.escrow_transactions (ship_by)
    where ship_by is not null and status = 'FUNDED';

create index if not exists escrow_confirmation_deadline_idx
    on public.escrow_transactions (confirmation_deadline)
    where confirmation_deadline is not null and status = 'FUNDED';

create index if not exists auctions_live_end_time_idx
    on public.auctions (end_time)
    where status = 'LIVE';
