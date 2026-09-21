-- =============================================================================
-- BIDZONE — Phase 7.2 FINAL (Model B): NFT asset system — additive migration
--
-- 1. Widen auctions.auction_type CHECK to include 'NFT'.
--    (Latent bug: the original constraint only allowed DIGITAL/PHYSICAL, so
--    auction_type='NFT' inserts would be rejected. Idempotent re-add.)
-- 2. nft_auctions link table — auction <-> NFT relationship.
--    nft_tokens.auction_id is written once (no client UPDATE policy by
--    design), so re-auctioning the same token needs a link table instead of
--    mutating the token row. One row per auction; insert-own by the acting
--    seller; public read (auction data is public anyway).
-- 3. Discovery indexes for wallet-owned collection scans.
--
-- Strictly additive: no column removal, no policy weakening, no data change.
-- Apply in Supabase Studio -> SQL Editor -> Run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) auctions.auction_type: allow 'NFT'
-- ---------------------------------------------------------------------------
alter table public.auctions drop constraint if exists auctions_auction_type_check;
alter table public.auctions add constraint auctions_auction_type_check
    check (auction_type in ('DIGITAL', 'PHYSICAL', 'NFT'));

-- ---------------------------------------------------------------------------
-- 2) nft_auctions link table
-- ---------------------------------------------------------------------------
create table if not exists public.nft_auctions (
    id            uuid primary key default gen_random_uuid(),
    auction_id    uuid not null references public.auctions(id) on delete cascade,
    creator_id    uuid not null references public.profiles(id),
    nft_contract  text not null,
    token_id      numeric not null,
    chain_id      numeric not null default 10143,
    created_at    timestamptz not null default now(),
    constraint nft_auctions_auction_unique unique (auction_id)
);

create index if not exists nft_auctions_token_idx
    on public.nft_auctions (lower(nft_contract), token_id, chain_id);
create index if not exists nft_auctions_creator_idx on public.nft_auctions (creator_id);

alter table public.nft_auctions enable row level security;

drop policy if exists nft_auctions_select_public on public.nft_auctions;
create policy nft_auctions_select_public
    on public.nft_auctions for select
    using (true);

drop policy if exists nft_auctions_insert_creator on public.nft_auctions;
create policy nft_auctions_insert_creator
    on public.nft_auctions for insert
    with check (creator_id = auth.uid());

-- NO client UPDATE/DELETE policies (append-only link index).

-- ---------------------------------------------------------------------------
-- 3) Discovery indexes on nft_tokens (existing table, indexes only)
-- ---------------------------------------------------------------------------
create index if not exists nft_tokens_owner_wallet_idx
    on public.nft_tokens (lower(owner_wallet));
create index if not exists nft_tokens_token_idx
    on public.nft_tokens (lower(nft_contract), token_id, chain_id);

-- ---------------------------------------------------------------------------
-- 4) Realtime for the link table
-- ---------------------------------------------------------------------------
alter table public.nft_auctions replica identity full;
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table public.nft_auctions;
        exception when duplicate_object then null;
        end;
    end if;
end $$;
