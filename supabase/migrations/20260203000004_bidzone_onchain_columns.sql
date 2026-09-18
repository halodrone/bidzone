-- =============================================================================
-- BIDZONE Phase 6.5 — additive on-chain metadata columns.
--
-- No existing 13-table architecture is redesigned. We attach only the
-- minimum fields needed to correlate an on-chain auction / bid / settlement
-- with its off-chain (Supabase) counterpart, and to render blockchain-
-- verified state honestly.
-- =============================================================================

-- ─── auctions: identify the on-chain twin ─────────────────────────────────
alter table public.auctions
    add column if not exists contract_auction_id text,      -- keccak256(uuid) hex
    add column if not exists chain_id            integer,
    add column if not exists contract_address    text,
    add column if not exists creation_tx_hash    text;

create index if not exists auctions_contract_auction_id_idx
    on public.auctions (contract_auction_id);

-- ─── bids: correlate submission tx ────────────────────────────────────────
-- transaction_hash column already exists (Phase 4.1). Nothing to add.

-- ─── escrow_transactions: correlate settlement tx & chain ─────────────────
alter table public.escrow_transactions
    add column if not exists chain_id         integer,
    add column if not exists contract_address text;

-- =============================================================================
-- End of migration
-- =============================================================================
