-- =============================================================================
-- BIDZONE — Phase 4.1 Initial Schema
-- Real-Time Social Auction dApp on Monad
-- =============================================================================
-- Notes:
--   * Financial values use NUMERIC(38, 18) to support wei-level Monad precision.
--     NEVER change these to floating-point (float / real / double precision).
--   * All primary keys are UUID (gen_random_uuid()).
--   * profiles.id references auth.users(id) so a Supabase user maps 1:1 to a
--     BIDZONE profile.
--   * Blockchain tx hashes are TEXT (0x-prefixed hex, variable length).
--   * Wallet addresses are stored as text; uniqueness is enforced
--     case-insensitively via a functional unique index on LOWER(wallet_address).
--   * Do NOT store private keys or seed phrases anywhere. This schema has no
--     column intended for such material.
-- =============================================================================

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =============================================================================
-- Enum-like CHECK domains (kept as CHECK constraints for flexibility)
-- =============================================================================

-- =============================================================================
-- PROFILES
-- =============================================================================
create table if not exists public.profiles (
    id                uuid primary key references auth.users(id) on delete cascade,
    wallet_address    text,
    username          citext unique,
    display_name      text,
    avatar_url        text,
    bio               text,
    reputation_score  integer not null default 0,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    constraint profiles_wallet_address_format
        check (wallet_address is null or wallet_address ~* '^0x[a-f0-9]{40}$')
);

-- Case-insensitive uniqueness for wallet addresses.
create unique index if not exists profiles_wallet_address_lower_key
    on public.profiles (lower(wallet_address))
    where wallet_address is not null;

create index if not exists profiles_username_idx on public.profiles (username);

-- =============================================================================
-- ADDRESSES  (PRIVATE — shipping data, never exposed publicly)
-- =============================================================================
create table if not exists public.addresses (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    recipient_name  text not null,
    phone           text,
    address_line    text not null,
    city            text not null,
    province        text,
    country         text not null,
    postal_code     text,
    is_default      boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on public.addresses (user_id);

-- Only one default per user
create unique index if not exists addresses_one_default_per_user
    on public.addresses (user_id)
    where is_default = true;

-- =============================================================================
-- AUCTIONS
-- =============================================================================
create table if not exists public.auctions (
    id                    uuid primary key default gen_random_uuid(),
    seller_id             uuid not null references public.profiles(id) on delete restrict,
    title                 text not null,
    description           text,
    category              text,
    condition             text,
    auction_type          text not null,
    starting_bid          numeric(38, 18) not null,
    current_bid           numeric(38, 18),
    minimum_increment     numeric(38, 18) not null,
    start_time            timestamptz,
    end_time              timestamptz,
    anti_sniping_seconds  integer not null default 0,
    status                text not null default 'DRAFT',
    allowed_regions       text[] not null default '{}',
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),

    constraint auctions_auction_type_check
        check (auction_type in ('DIGITAL', 'PHYSICAL')),
    constraint auctions_status_check
        check (status in ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED')),
    constraint auctions_starting_bid_nonneg
        check (starting_bid >= 0),
    constraint auctions_minimum_increment_pos
        check (minimum_increment > 0),
    constraint auctions_current_bid_nonneg
        check (current_bid is null or current_bid >= 0),
    constraint auctions_anti_sniping_nonneg
        check (anti_sniping_seconds >= 0),
    constraint auctions_time_order
        check (start_time is null or end_time is null or end_time > start_time)
);

create index if not exists auctions_seller_id_idx on public.auctions (seller_id);
create index if not exists auctions_status_idx    on public.auctions (status);
create index if not exists auctions_end_time_idx  on public.auctions (end_time);
create index if not exists auctions_category_idx  on public.auctions (category);
create index if not exists auctions_status_end_time_idx
    on public.auctions (status, end_time);

-- =============================================================================
-- AUCTION_ITEMS (media attached to auctions)
-- =============================================================================
create table if not exists public.auction_items (
    id          uuid primary key default gen_random_uuid(),
    auction_id  uuid not null references public.auctions(id) on delete cascade,
    media_url   text not null,
    media_type  text not null,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),

    constraint auction_items_media_type_check
        check (media_type in ('IMAGE', 'VIDEO'))
);

create index if not exists auction_items_auction_id_idx
    on public.auction_items (auction_id, sort_order);

-- =============================================================================
-- BIDS
-- =============================================================================
create table if not exists public.bids (
    id                uuid primary key default gen_random_uuid(),
    auction_id        uuid not null references public.auctions(id) on delete cascade,
    bidder_id         uuid not null references public.profiles(id) on delete restrict,
    wallet_address    text not null,
    amount            numeric(38, 18) not null,
    status            text not null default 'ACTIVE',
    transaction_hash  text,
    created_at        timestamptz not null default now(),

    constraint bids_status_check
        check (status in ('ACTIVE', 'OUTBID', 'WINNING', 'REFUNDED', 'CANCELLED')),
    constraint bids_amount_positive
        check (amount > 0),
    constraint bids_wallet_format
        check (wallet_address ~* '^0x[a-f0-9]{40}$')
);

create index if not exists bids_auction_id_idx        on public.bids (auction_id);
create index if not exists bids_bidder_id_idx         on public.bids (bidder_id);
create index if not exists bids_status_idx            on public.bids (status);
create index if not exists bids_wallet_address_lower_idx
    on public.bids (lower(wallet_address));
create index if not exists bids_auction_amount_desc_idx
    on public.bids (auction_id, amount desc);
create unique index if not exists bids_transaction_hash_unique
    on public.bids (transaction_hash)
    where transaction_hash is not null;

-- =============================================================================
-- WATCHLIST
-- =============================================================================
create table if not exists public.watchlist (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    auction_id  uuid not null references public.auctions(id)  on delete cascade,
    created_at  timestamptz not null default now(),
    unique (user_id, auction_id)
);

create index if not exists watchlist_user_id_idx    on public.watchlist (user_id);
create index if not exists watchlist_auction_id_idx on public.watchlist (auction_id);

-- =============================================================================
-- REACTIONS
-- =============================================================================
create table if not exists public.reactions (
    id             uuid primary key default gen_random_uuid(),
    auction_id     uuid not null references public.auctions(id) on delete cascade,
    user_id        uuid not null references public.profiles(id) on delete cascade,
    reaction_type  text not null,
    created_at     timestamptz not null default now(),
    unique (auction_id, user_id, reaction_type)
);

create index if not exists reactions_auction_id_idx on public.reactions (auction_id);
create index if not exists reactions_user_id_idx    on public.reactions (user_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================
create table if not exists public.comments (
    id          uuid primary key default gen_random_uuid(),
    auction_id  uuid not null references public.auctions(id) on delete cascade,
    user_id     uuid not null references public.profiles(id) on delete cascade,
    message     text not null,
    created_at  timestamptz not null default now(),
    constraint comments_message_not_empty check (length(btrim(message)) > 0),
    constraint comments_message_max_len   check (length(message) <= 1000)
);

create index if not exists comments_auction_id_idx on public.comments (auction_id, created_at desc);
create index if not exists comments_user_id_idx    on public.comments (user_id);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
create table if not exists public.notifications (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    type        text not null,
    auction_id  uuid references public.auctions(id) on delete set null,
    bid_id      uuid references public.bids(id)     on delete set null,
    message     text not null,
    is_read     boolean not null default false,
    created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx
    on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
    on public.notifications (user_id) where is_read = false;

-- =============================================================================
-- SHIPPING
-- =============================================================================
create table if not exists public.shipping (
    id                    uuid primary key default gen_random_uuid(),
    auction_id            uuid not null references public.auctions(id) on delete restrict,
    buyer_id              uuid not null references public.profiles(id) on delete restrict,
    seller_id             uuid not null references public.profiles(id) on delete restrict,
    shipping_address_id   uuid not null references public.addresses(id) on delete restrict,
    carrier               text,
    tracking_number       text,
    tracking_status       text not null default 'PENDING',
    shipped_at            timestamptz,
    delivered_at          timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),

    constraint shipping_status_check
        check (tracking_status in
            ('PENDING', 'LABEL_CREATED', 'SHIPPED', 'IN_TRANSIT',
             'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED')),
    unique (auction_id)
);

create index if not exists shipping_buyer_id_idx  on public.shipping (buyer_id);
create index if not exists shipping_seller_id_idx on public.shipping (seller_id);
create index if not exists shipping_status_idx    on public.shipping (tracking_status);

-- =============================================================================
-- ESCROW_TRANSACTIONS
-- =============================================================================
create table if not exists public.escrow_transactions (
    id                uuid primary key default gen_random_uuid(),
    auction_id        uuid not null references public.auctions(id) on delete restrict,
    buyer_id          uuid not null references public.profiles(id) on delete restrict,
    seller_id         uuid not null references public.profiles(id) on delete restrict,
    amount            numeric(38, 18) not null,
    status            text not null default 'PENDING',
    transaction_hash  text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    constraint escrow_amount_positive check (amount > 0),
    constraint escrow_status_check check (status in
        ('PENDING', 'FUNDED', 'RELEASED', 'REFUNDED', 'DISPUTED', 'CANCELLED'))
);

create index if not exists escrow_auction_id_idx on public.escrow_transactions (auction_id);
create index if not exists escrow_buyer_id_idx   on public.escrow_transactions (buyer_id);
create index if not exists escrow_seller_id_idx  on public.escrow_transactions (seller_id);
create index if not exists escrow_status_idx     on public.escrow_transactions (status);
create unique index if not exists escrow_transaction_hash_unique
    on public.escrow_transactions (transaction_hash)
    where transaction_hash is not null;

-- =============================================================================
-- DISPUTES
-- =============================================================================
create table if not exists public.disputes (
    id           uuid primary key default gen_random_uuid(),
    auction_id   uuid not null references public.auctions(id) on delete restrict,
    buyer_id     uuid not null references public.profiles(id) on delete restrict,
    seller_id    uuid not null references public.profiles(id) on delete restrict,
    reason       text not null,
    description  text,
    status       text not null default 'OPEN',
    resolution   text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint disputes_status_check
        check (status in ('OPEN', 'UNDER_REVIEW', 'RESOLVED_BUYER',
                          'RESOLVED_SELLER', 'CANCELLED'))
);

create index if not exists disputes_auction_id_idx on public.disputes (auction_id);
create index if not exists disputes_buyer_id_idx   on public.disputes (buyer_id);
create index if not exists disputes_seller_id_idx  on public.disputes (seller_id);
create index if not exists disputes_status_idx     on public.disputes (status);

-- =============================================================================
-- REPUTATION_EVENTS
-- =============================================================================
create table if not exists public.reputation_events (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    auction_id  uuid references public.auctions(id) on delete set null,
    event_type  text not null,
    points      integer not null,
    created_at  timestamptz not null default now()
);

create index if not exists reputation_events_user_id_idx
    on public.reputation_events (user_id, created_at desc);
create index if not exists reputation_events_auction_id_idx
    on public.reputation_events (auction_id);

-- =============================================================================
-- updated_at auto-touch trigger
-- =============================================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'profiles', 'addresses', 'auctions', 'shipping',
            'escrow_transactions', 'disputes'
        ])
    loop
        execute format(
            'drop trigger if exists set_updated_at on public.%I;
             create trigger set_updated_at
             before update on public.%I
             for each row execute function public.tg_set_updated_at();',
            t, t
        );
    end loop;
end;
$$;

-- =============================================================================
-- Auto-create a profile row when a new auth user is created
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =============================================================================
-- Bid validation trigger — enforces transparent auction rules server-side
-- Prevents client-side bypass of: auction status, minimum increment, timing.
-- Amount validation is done in the DB; final settlement will come from the
-- Monad smart-contract escrow in a later phase.
-- =============================================================================
create or replace function public.tg_validate_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    a record;
    min_next numeric(38, 18);
begin
    select id, seller_id, status, starting_bid, current_bid,
           minimum_increment, start_time, end_time
      into a
      from public.auctions
     where id = new.auction_id
     for update;

    if not found then
        raise exception 'AUCTION_NOT_FOUND';
    end if;

    if a.status <> 'LIVE' then
        raise exception 'AUCTION_NOT_LIVE (status=%)', a.status;
    end if;

    if a.end_time is not null and now() >= a.end_time then
        raise exception 'AUCTION_ENDED';
    end if;

    if a.start_time is not null and now() < a.start_time then
        raise exception 'AUCTION_NOT_STARTED';
    end if;

    if new.bidder_id = a.seller_id then
        raise exception 'SELLER_CANNOT_BID';
    end if;

    min_next := coalesce(a.current_bid + a.minimum_increment, a.starting_bid);
    if new.amount < min_next then
        raise exception 'BID_BELOW_MINIMUM (required >= %)', min_next;
    end if;

    -- Force server-controlled status on insert
    new.status := 'ACTIVE';
    return new;
end;
$$;

drop trigger if exists validate_bid_before_insert on public.bids;
create trigger validate_bid_before_insert
    before insert on public.bids
    for each row execute function public.tg_validate_bid();

-- After a bid is accepted, mark prior ACTIVE/WINNING bids as OUTBID and update
-- the auction's current_bid. Anti-sniping: extend end_time if within window.
create or replace function public.tg_after_bid_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    a record;
begin
    select end_time, anti_sniping_seconds
      into a
      from public.auctions
     where id = new.auction_id
     for update;

    update public.bids
       set status = 'OUTBID'
     where auction_id = new.auction_id
       and id <> new.id
       and status in ('ACTIVE', 'WINNING');

    update public.bids
       set status = 'WINNING'
     where id = new.id;

    update public.auctions
       set current_bid = new.amount,
           end_time = case
             when a.end_time is not null
              and a.anti_sniping_seconds > 0
              and (a.end_time - now()) < make_interval(secs => a.anti_sniping_seconds)
             then now() + make_interval(secs => a.anti_sniping_seconds)
             else a.end_time
           end
     where id = new.auction_id;

    return new;
end;
$$;

drop trigger if exists after_bid_insert on public.bids;
create trigger after_bid_insert
    after insert on public.bids
    for each row execute function public.tg_after_bid_insert();
