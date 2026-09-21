-- =============================================================================
-- BIDZONE — Phase 7.2: NFT Auction — additive migration
--
-- NEW tables (everything else untouched):
--   nft_tokens  — one row per BIDZONE-minted ERC-721 (mirror of on-chain;
--                 the CHAIN is authoritative — UI re-verifies ownerOf live).
--   nft_events  — append-only lifecycle log (MINT/ESCROW/SETTLE/TRANSFER)
--                 written by the acting user with THEIR OWN tx hash.
-- RLS model:
--   * metadata is public/readable (transparency),
--   * INSERT only by the acting user (creator/actor = auth.uid()),
--   * NO client UPDATE anywhere — users cannot manually mark ownership,
--     settlement, or edit token ids / contract addresses / tx hashes;
--     server/on-chain verification stays authoritative.
-- Backward compatible: new tables only; no existing table/policy/data touched.
-- =============================================================================

create table if not exists public.nft_tokens (
    id             uuid primary key default gen_random_uuid(),
    auction_id     uuid references public.auctions(id) on delete set null,
    creator_id     uuid not null references public.profiles(id),
    nft_contract   text not null,
    token_id       numeric not null,
    token_uri      text not null,
    name           text not null,
    description    text,
    collection_name text,
    attributes     jsonb not null default '[]'::jsonb,
    owner_wallet   text,
    mint_tx_hash   text,
    chain_id       numeric not null default 10143,
    created_at     timestamptz not null default now(),
    constraint nft_tokens_asset_unique unique (nft_contract, token_id, chain_id)
);

create table if not exists public.nft_events (
    id            uuid primary key default gen_random_uuid(),
    token_row_id  uuid not null references public.nft_tokens(id) on delete cascade,
    event_type    text not null check (event_type in ('MINT','ESCROW','SETTLE','TRANSFER')),
    actor_id      uuid references public.profiles(id),
    tx_hash       text not null,
    to_wallet     text,
    created_at    timestamptz not null default now()
);

create index if not exists nft_tokens_creator_idx   on public.nft_tokens (creator_id);
create index if not exists nft_tokens_auction_idx   on public.nft_tokens (auction_id);
create index if not exists nft_events_token_idx     on public.nft_events (token_row_id);

-- =========================== RLS ===========================
alter table public.nft_tokens enable row level security;
alter table public.nft_events  enable row level security;

-- Metadata transparent: anyone (incl. guests) can read.
drop policy if exists nft_tokens_select_public on public.nft_tokens;
create policy nft_tokens_select_public
    on public.nft_tokens for select
    using (true);

-- Only the creator records their own mint row.
drop policy if exists nft_tokens_insert_creator on public.nft_tokens;
create policy nft_tokens_insert_creator
    on public.nft_tokens for insert
    with check (creator_id = auth.uid());

-- NO update/delete policies for clients: users cannot manually mark
-- ownership/settlement or edit token/contract/tx fields.

drop policy if exists nft_events_select_public on public.nft_events;
create policy nft_events_select_public
    on public.nft_events for select
    using (true);

drop policy if exists nft_events_insert_actor on public.nft_events;
create policy nft_events_insert_actor
    on public.nft_events for insert
    with check (actor_id = auth.uid());

-- =========================== REALTIME ===========================
alter table public.nft_tokens  replica identity full;
alter table public.nft_events  replica identity full;
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table public.nft_tokens;
        exception when duplicate_object then null;
        end;
        begin
            alter publication supabase_realtime add table public.nft_events;
        exception when duplicate_object then null;
        end;
    end if;
end $$;
