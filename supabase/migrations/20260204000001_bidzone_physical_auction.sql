-- =============================================================================
-- BIDZONE — Phase 7: Physical Auction — additive migration
--
-- Reuses the EXISTING architecture (Phase 4.1 schema + Phase 4.2 lifecycle):
--   * shipping / addresses / disputes / escrow_transactions tables untouched
--   * lifecycle RPCs untouched (buyer_submit_shipping_address,
--     seller_record_shipment, buyer_confirm_receipt, open_dispute,
--     update_shipping_tracking, check_ship_deadlines, check_auto_releases)
--   * DIGITAL auction behavior unchanged
-- Adds:
--   1) auctions.shipping_origin        — public seller shipping origin text
--                                        (allowed_regions already exists)
--   2) addresses_select_fulfillment_seller RLS policy — the seller of a
--      shipment may read the ONE buyer address attached to their shipping row
--      (shipping rows can only be created post-win post-FUNDED via
--      buyer_submit_shipping_address, so this disclosure is fulfillment-only
--      and changes nothing for public/other users)
--   3) tg_require_physical_address     — a bid on a PHYSICAL auction is
--      rejected unless the bidder already owns at least one address row
--      (buyer privacy: only EXISTENCE is checked, never the content)
-- Backward compatible: additive columns/policies only; no drops; no data
-- changes; no RLS weakening (one new, narrowly-scoped SELECT policy).
-- =============================================================================

-- 1) Public shipping origin -------------------------------------------------
alter table public.auctions
    add column if not exists shipping_origin text;

-- 2) Seller may read the buyer address attached to THEIR shipment row -------
drop policy if exists addresses_select_fulfillment_seller on public.addresses;
create policy addresses_select_fulfillment_seller
    on public.addresses for select
    using (
        exists (
            select 1 from public.shipping s
             where s.shipping_address_id = addresses.id
               and s.seller_id = auth.uid()
        )
    );

-- 3) PHYSICAL bids require an existing buyer address (existence only) -------
create or replace function public.tg_require_physical_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_type text;
begin
    select auction_type into v_type from public.auctions where id = new.auction_id;
    if v_type = 'PHYSICAL' then
        if new.bidder_id is null then
            raise exception 'SHIPPING_ADDRESS_REQUIRED';
        end if;
        if not exists (
            select 1 from public.addresses where user_id = new.bidder_id
        ) then
            raise exception 'SHIPPING_ADDRESS_REQUIRED';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists tg_require_physical_address on public.bids;
create trigger tg_require_physical_address
    before insert on public.bids
    for each row execute function public.tg_require_physical_address();
