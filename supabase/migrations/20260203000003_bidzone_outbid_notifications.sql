-- =============================================================================
-- BIDZONE Phase 6.4 — OUTBID notifications on bid submission.
--
-- Extends tg_after_bid_insert to:
-- (a) mark prior ACTIVE/WINNING bids as OUTBID,
-- (b) update auction current_bid / anti-sniping end_time,
-- (c) emit one OUTBID notification per distinct outbid bidder for this auction.
-- =============================================================================

create or replace function public.tg_after_bid_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    a record;
    o record;
begin
    select seller_id, end_time, anti_sniping_seconds
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

    -- Emit OUTBID notification for each distinct prior bidder (skip the
    -- new bidder in case they had a prior bid on the same auction).
    for o in
        select distinct b.bidder_id
          from public.bids b
         where b.auction_id = new.auction_id
           and b.id <> new.id
           and b.status = 'OUTBID'
           and b.bidder_id <> new.bidder_id
    loop
        perform public.emit_notification(
            o.bidder_id, 'OUTBID', new.auction_id, new.id,
            'You have been outbid.',
            'outbid:' || new.auction_id::text || ':' || new.id::text || ':' || o.bidder_id::text
        );
    end loop;

    return new;
end;
$$;

drop trigger if exists after_bid_insert on public.bids;
create trigger after_bid_insert
    after insert on public.bids
    for each row execute function public.tg_after_bid_insert();
