-- =============================================================================
-- BIDZONE — Phase 4.1 Row Level Security (RLS) Policies
-- =============================================================================
-- Principles:
--   * Public users can read PUBLIC auction & bid history (transparency).
--   * Private shipping addresses are NEVER exposed publicly.
--   * Users can only mutate their own profile / addresses / watchlist /
--     reactions / comments.
--   * Bids: users may INSERT their own bids (trigger enforces auction rules).
--     Bid status transitions (OUTBID / WINNING / REFUNDED / CANCELLED) are
--     performed by DB triggers or the service role — NEVER by clients.
--   * Escrow, reputation events, shipping status updates, disputes:
--     mutations must go through server-side (service role / edge functions
--     / Monad settlement webhook). This file INTENTIONALLY grants NO client
--     UPDATE/DELETE policies on those tables — this is documented, not a bug.
-- =============================================================================

-- Enable RLS on every table ---------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.addresses             enable row level security;
alter table public.auctions              enable row level security;
alter table public.auction_items         enable row level security;
alter table public.bids                  enable row level security;
alter table public.watchlist             enable row level security;
alter table public.reactions             enable row level security;
alter table public.comments              enable row level security;
alter table public.notifications         enable row level security;
alter table public.shipping              enable row level security;
alter table public.escrow_transactions   enable row level security;
alter table public.disputes              enable row level security;
alter table public.reputation_events     enable row level security;

-- Force RLS so table owner is not bypassed unintentionally
alter table public.addresses             force row level security;
alter table public.shipping              force row level security;
alter table public.escrow_transactions   force row level security;
alter table public.disputes              force row level security;

-- =============================================================================
-- PROFILES
-- =============================================================================
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
    on public.profiles for select
    using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
    on public.profiles for insert
    with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
    on public.profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());
-- No DELETE policy: profile deletion cascades from auth.users deletion only.

-- =============================================================================
-- ADDRESSES  (STRICTLY PRIVATE)
-- =============================================================================
drop policy if exists addresses_select_own on public.addresses;
create policy addresses_select_own
    on public.addresses for select
    using (user_id = auth.uid());

drop policy if exists addresses_insert_own on public.addresses;
create policy addresses_insert_own
    on public.addresses for insert
    with check (user_id = auth.uid());

drop policy if exists addresses_update_own on public.addresses;
create policy addresses_update_own
    on public.addresses for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists addresses_delete_own on public.addresses;
create policy addresses_delete_own
    on public.addresses for delete
    using (user_id = auth.uid());

-- =============================================================================
-- AUCTIONS
-- =============================================================================
-- Public can see SCHEDULED / LIVE / ENDED / CANCELLED auctions.
-- Only the seller can see their own DRAFT auctions.
drop policy if exists auctions_select_public on public.auctions;
create policy auctions_select_public
    on public.auctions for select
    using (
        status in ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED')
        or seller_id = auth.uid()
    );

drop policy if exists auctions_insert_seller on public.auctions;
create policy auctions_insert_seller
    on public.auctions for insert
    with check (seller_id = auth.uid());

-- Seller may update their own auction, but cannot change seller_id,
-- current_bid, or move OUT of a terminal state. current_bid is mutated
-- only via the after-bid trigger (SECURITY DEFINER).
drop policy if exists auctions_update_seller on public.auctions;
create policy auctions_update_seller
    on public.auctions for update
    using (seller_id = auth.uid() and status in ('DRAFT', 'SCHEDULED', 'LIVE'))
    with check (seller_id = auth.uid());

drop policy if exists auctions_delete_seller_draft on public.auctions;
create policy auctions_delete_seller_draft
    on public.auctions for delete
    using (seller_id = auth.uid() and status = 'DRAFT');

-- =============================================================================
-- AUCTION_ITEMS
-- =============================================================================
drop policy if exists auction_items_select_public on public.auction_items;
create policy auction_items_select_public
    on public.auction_items for select
    using (
        exists (
            select 1 from public.auctions a
             where a.id = auction_items.auction_id
               and (a.status in ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED')
                    or a.seller_id = auth.uid())
        )
    );

drop policy if exists auction_items_manage_seller on public.auction_items;
create policy auction_items_manage_seller
    on public.auction_items for all
    using (
        exists (
            select 1 from public.auctions a
             where a.id = auction_items.auction_id
               and a.seller_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.auctions a
             where a.id = auction_items.auction_id
               and a.seller_id = auth.uid()
        )
    );

-- =============================================================================
-- BIDS
-- =============================================================================
-- Public bid history is transparent (a core BIDZONE rule).
drop policy if exists bids_select_public on public.bids;
create policy bids_select_public
    on public.bids for select
    using (true);

-- A user may only insert bids for themselves.
-- The tg_validate_bid trigger enforces:
--   auction is LIVE, not ended, seller cannot self-bid,
--   amount >= current_bid + minimum_increment (or starting_bid),
--   status is forced to 'ACTIVE'.
drop policy if exists bids_insert_self on public.bids;
create policy bids_insert_self
    on public.bids for insert
    with check (bidder_id = auth.uid());

-- INTENTIONALLY NO CLIENT UPDATE / DELETE POLICY on bids.
-- Bid status transitions (OUTBID / WINNING / REFUNDED / CANCELLED) and
-- amount/transaction_hash edits must happen via DB triggers (already defined)
-- or the service role responding to Monad smart-contract events.
-- Do NOT add client policies here without a full audit — doing so breaks
-- the transparency guarantee.

-- =============================================================================
-- WATCHLIST
-- =============================================================================
drop policy if exists watchlist_select_own on public.watchlist;
create policy watchlist_select_own
    on public.watchlist for select
    using (user_id = auth.uid());

drop policy if exists watchlist_insert_own on public.watchlist;
create policy watchlist_insert_own
    on public.watchlist for insert
    with check (user_id = auth.uid());

drop policy if exists watchlist_delete_own on public.watchlist;
create policy watchlist_delete_own
    on public.watchlist for delete
    using (user_id = auth.uid());

-- =============================================================================
-- REACTIONS
-- =============================================================================
drop policy if exists reactions_select_public on public.reactions;
create policy reactions_select_public
    on public.reactions for select
    using (true);

drop policy if exists reactions_insert_own on public.reactions;
create policy reactions_insert_own
    on public.reactions for insert
    with check (user_id = auth.uid());

drop policy if exists reactions_delete_own on public.reactions;
create policy reactions_delete_own
    on public.reactions for delete
    using (user_id = auth.uid());

-- =============================================================================
-- COMMENTS
-- =============================================================================
drop policy if exists comments_select_public on public.comments;
create policy comments_select_public
    on public.comments for select
    using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
    on public.comments for insert
    with check (user_id = auth.uid());

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
    on public.comments for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
    on public.comments for delete
    using (user_id = auth.uid());

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
    on public.notifications for select
    using (user_id = auth.uid());

-- Users may only flip is_read on their own rows. Message/type/auction_id/bid_id
-- edits should not be allowed even by the row owner.
drop policy if exists notifications_update_is_read on public.notifications;
create policy notifications_update_is_read
    on public.notifications for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- INSERT/DELETE are performed by the service role or DB triggers only.
-- No client INSERT/DELETE policies by design.

-- =============================================================================
-- SHIPPING
-- =============================================================================
-- Buyer and seller can view the shipping row for their auction.
-- Address details are NOT exposed here — the shipping_address_id column is a
-- UUID pointer only. The addresses table itself is protected by RLS so a
-- non-owner cannot resolve it.
drop policy if exists shipping_select_parties on public.shipping;
create policy shipping_select_parties
    on public.shipping for select
    using (buyer_id = auth.uid() or seller_id = auth.uid());

-- INTENTIONALLY NO CLIENT INSERT / UPDATE / DELETE POLICY.
-- Shipping rows are created and updated by the service role (order-fulfillment
-- flow / carrier webhook / seller-dashboard endpoint that validates payload).
-- SERVER-SIDE REQUIRED: an edge function that (a) verifies buyer==auction winner,
-- (b) verifies shipping_address_id belongs to buyer, (c) writes the row using
-- the service key.

-- =============================================================================
-- ESCROW_TRANSACTIONS
-- =============================================================================
drop policy if exists escrow_select_parties on public.escrow_transactions;
create policy escrow_select_parties
    on public.escrow_transactions for select
    using (buyer_id = auth.uid() or seller_id = auth.uid());

-- INTENTIONALLY NO CLIENT INSERT / UPDATE / DELETE POLICY.
-- Escrow records mirror on-chain Monad state and must only be written by the
-- backend service role responding to smart-contract events / indexer.
-- SERVER-SIDE REQUIRED for all mutations.

-- =============================================================================
-- DISPUTES
-- =============================================================================
drop policy if exists disputes_select_parties on public.disputes;
create policy disputes_select_parties
    on public.disputes for select
    using (buyer_id = auth.uid() or seller_id = auth.uid());

-- A buyer OR seller of the auction may open a dispute for that auction.
drop policy if exists disputes_insert_party on public.disputes;
create policy disputes_insert_party
    on public.disputes for insert
    with check (
        (buyer_id = auth.uid() or seller_id = auth.uid())
        and exists (
            select 1 from public.auctions a
             where a.id = disputes.auction_id
               and (a.seller_id = auth.uid() or
                    exists (select 1 from public.bids b
                             where b.auction_id = a.id
                               and b.bidder_id = auth.uid()))
        )
    );

-- Status/resolution changes are handled by moderator/admin via service role.
-- No client UPDATE / DELETE policy.

-- =============================================================================
-- REPUTATION_EVENTS
-- =============================================================================
-- Public read so profile reputation is transparent and auditable.
drop policy if exists reputation_events_select_public on public.reputation_events;
create policy reputation_events_select_public
    on public.reputation_events for select
    using (true);

-- INTENTIONALLY NO CLIENT INSERT / UPDATE / DELETE POLICY.
-- Reputation events are appended only by the service role in response to
-- verified events (auction completed, dispute resolved, etc.).
-- SERVER-SIDE REQUIRED for all mutations.
