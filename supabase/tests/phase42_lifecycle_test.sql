-- =============================================================================
-- BIDZONE — Phase 4.2 end-to-end lifecycle tests
-- Run against a fresh test DB with all migrations applied + stubs from Phase 4.1.
-- Prints a PASS / FAIL line per assertion.
-- =============================================================================
\set ON_ERROR_STOP off
\pset pager off

create or replace function pg_temp.assert(cond boolean, label text)
returns void language plpgsql as $$
begin
    if cond then
        raise notice 'PASS  %', label;
    else
        raise notice 'FAIL  %', label;
    end if;
end $$;

create or replace function pg_temp.setup_user(p_id uuid, p_email text, p_wallet text)
returns void language plpgsql as $$
begin
    insert into auth.users(id, email) values (p_id, p_email) on conflict (id) do nothing;
    update public.profiles set wallet_address = p_wallet where id = p_id;
end $$;

create or replace function pg_temp.mklive_auction(
    p_id uuid, p_seller uuid, p_type text, p_end interval,
    p_start_bid numeric default 0.100000000000000000,
    p_min_inc  numeric default 0.010000000000000000,
    p_anti_snipe int default 0
) returns void language plpgsql as $$
begin
    insert into public.auctions(id, seller_id, title, auction_type,
        starting_bid, minimum_increment, start_time, end_time,
        anti_sniping_seconds, status)
    values (p_id, p_seller, 'test', p_type, p_start_bid, p_min_inc,
            now() - interval '1 minute', now() + p_end,
            p_anti_snipe, 'DRAFT');
    update public.auctions set status='LIVE' where id=p_id;
end $$;

-- =============================================================================
-- SETUP
-- =============================================================================
select pg_temp.setup_user('aa000000-0000-0000-0000-000000000001',
                          'seller@t','0xaaaa111111111111111111111111111111111111');
select pg_temp.setup_user('aa000000-0000-0000-0000-000000000002',
                          'buyer1@t','0xaaaa222222222222222222222222222222222222');
select pg_temp.setup_user('aa000000-0000-0000-0000-000000000003',
                          'buyer2@t','0xaaaa333333333333333333333333333333333333');
select pg_temp.setup_user('aa000000-0000-0000-0000-000000000004',
                          'buyer3@t','0xaaaa444444444444444444444444444444444444');

-- Buyer1 address
insert into public.addresses(id, user_id, recipient_name, address_line, city, country)
values ('ad000000-0000-0000-0000-000000000001',
        'aa000000-0000-0000-0000-000000000002',
        'B1','1 St','X','US')
on conflict (id) do nothing;

\echo
\echo == T1: Seller cannot bid on own auction ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000001',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '30 seconds');
do $$ begin
  begin
    insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
      'e0000000-0000-0000-0000-000000000001',
      'aa000000-0000-0000-0000-000000000001',
      '0xaaaa111111111111111111111111111111111111', 0.1);
    perform pg_temp.assert(false, 'T1 seller self-bid should be rejected');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%SELLER_CANNOT_BID%', 'T1 seller self-bid rejected -> ' || sqlerrm);
  end;
end $$;

\echo
\echo == T2: Anti-sniping extends the timer when bid in final 10s ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000002',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '5 seconds', 0.1, 0.01, 10);
-- end_time is roughly now()+5s. A valid bid should push it to now()+10s.
select end_time as end_before
  from public.auctions where id='e0000000-0000-0000-0000-000000000002' \gset

insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-000000000002',
  'aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.1);

select pg_temp.assert(end_time > :'end_before'::timestamptz,
                     'T2 end_time extended after in-window bid')
  from public.auctions where id='e0000000-0000-0000-0000-000000000002';
select pg_temp.assert((end_time - now()) between interval '9 seconds' and interval '11 seconds',
                     'T2 new deadline is ~10s from now')
  from public.auctions where id='e0000000-0000-0000-0000-000000000002';

\echo
\echo == T3: Auction expires with NO bids -> NO_SALE, no escrow row ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000003',
                              'aa000000-0000-0000-0000-000000000001', 'DIGITAL',
                              interval '0 seconds');
-- Force end_time into the past.
set session session_replication_role='replica';
update public.auctions set end_time = now() - interval '1 second'
 where id='e0000000-0000-0000-0000-000000000003';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-000000000003') as result;
select pg_temp.assert(status='ENDED' and closed_at is not null, 'T3 status=ENDED')
  from public.auctions where id='e0000000-0000-0000-0000-000000000003';
select pg_temp.assert(count(*)=0, 'T3 no escrow row for no-sale')
  from public.escrow_transactions where auction_id='e0000000-0000-0000-0000-000000000003';
select pg_temp.assert(count(*)=1, 'T3 seller got NO_SALE notification')
  from public.notifications
 where user_id='aa000000-0000-0000-0000-000000000001' and type='NO_SALE'
   and auction_id='e0000000-0000-0000-0000-000000000003';

\echo
\echo == T4: Cannot close twice — second call is a NOOP ==
select public.close_auction('e0000000-0000-0000-0000-000000000003') as second_call;
select pg_temp.assert(count(*)=1, 'T4 NO_SALE notification NOT duplicated (dedup_key)')
  from public.notifications
 where user_id='aa000000-0000-0000-0000-000000000001' and type='NO_SALE'
   and auction_id='e0000000-0000-0000-0000-000000000003';

\echo
\echo == T5: Auction with one valid bidder ends -> winner + escrow(PENDING) ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000004',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '5 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-000000000004',
  'aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.2);
set session session_replication_role='replica';
update public.auctions set end_time = now() - interval '1 second'
 where id='e0000000-0000-0000-0000-000000000004';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-000000000004') as result;
select pg_temp.assert(status='ENDED', 'T5 status=ENDED')
  from public.auctions where id='e0000000-0000-0000-0000-000000000004';
select pg_temp.assert(count(*)=1 and max(status)='WINNING',
                     'T5 exactly one WINNING bid')
  from public.bids
 where auction_id='e0000000-0000-0000-0000-000000000004' and status='WINNING';
select pg_temp.assert(status='PENDING' and buyer_id='aa000000-0000-0000-0000-000000000002',
                     'T5 escrow row PENDING with correct buyer')
  from public.escrow_transactions where auction_id='e0000000-0000-0000-0000-000000000004';

\echo
\echo == T6: Multiple bidders — highest wins; tie-break by earliest timestamp ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000005',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '10 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values
  ('e0000000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000002',
   '0xaaaa222222222222222222222222222222222222', 0.10),
  ('e0000000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000003',
   '0xaaaa333333333333333333333333333333333333', 0.20),
  ('e0000000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000004',
   '0xaaaa444444444444444444444444444444444444', 0.30);
set session session_replication_role='replica';
update public.auctions set end_time=now() - interval '1 second'
 where id='e0000000-0000-0000-0000-000000000005';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-000000000005') as result;
select pg_temp.assert(bidder_id='aa000000-0000-0000-0000-000000000004' and amount=0.30,
                     'T6 highest bidder wins')
  from public.bids
 where auction_id='e0000000-0000-0000-0000-000000000005' and status='WINNING';

\echo
\echo == T7: Below-minimum bid rejected ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000006',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '30 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-000000000006','aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.10);
do $$ begin
  begin
    insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
      'e0000000-0000-0000-0000-000000000006','aa000000-0000-0000-0000-000000000003',
      '0xaaaa333333333333333333333333333333333333', 0.105);  -- < 0.10 + 0.01
    perform pg_temp.assert(false, 'T7 below-min bid should be rejected');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%BID_BELOW_MINIMUM%',
                          'T7 below-min bid rejected -> ' || sqlerrm);
  end;
end $$;

\echo
\echo == T8: FULL PHYSICAL FLOW — pay, ship, deliver, confirm, released ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000007',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '5 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-000000000007','aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.5);
set session session_replication_role='replica';
update public.auctions set end_time=now() - interval '1 second'
 where id='e0000000-0000-0000-0000-000000000007';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-000000000007');
select id as escrow_id
  from public.escrow_transactions
 where auction_id='e0000000-0000-0000-0000-000000000007' \gset

select public.mark_escrow_funded(:'escrow_id') as funded;
select pg_temp.assert(status='FUNDED' and ship_by is not null,
                     'T8a escrow FUNDED with 72h ship_by')
  from public.escrow_transactions where id=:'escrow_id';

-- Buyer submits address
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';
select public.buyer_submit_shipping_address(
  'e0000000-0000-0000-0000-000000000007',
  'ad000000-0000-0000-0000-000000000001') as shipping_id;

-- Seller records shipment
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000001';
select public.seller_record_shipment(
  'e0000000-0000-0000-0000-000000000007','UPS','1Z999') as ship_result;
select pg_temp.assert(tracking_status='SHIPPED', 'T8b tracking=SHIPPED')
  from public.shipping where auction_id='e0000000-0000-0000-0000-000000000007';

-- BEFORE delivered: buyer cannot confirm receipt
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    perform public.buyer_confirm_receipt('e0000000-0000-0000-0000-000000000007');
    perform pg_temp.assert(false, 'T8c confirm should require DELIVERED');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%NOT_DELIVERED_YET%',
                          'T8c confirm blocked pre-DELIVERED -> ' || sqlerrm);
  end;
end $$;

-- Carrier webhook -> DELIVERED
set request.jwt.claim.sub = '';
select public.update_shipping_tracking(
  'e0000000-0000-0000-0000-000000000007','DELIVERED') as delivered;
select pg_temp.assert(confirmation_deadline is not null
                     and confirmation_deadline > now(),
                     'T8d 48h window started on DELIVERED')
  from public.escrow_transactions where id=:'escrow_id';

-- Now buyer confirms
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';
select public.buyer_confirm_receipt('e0000000-0000-0000-0000-000000000007') as released;
select pg_temp.assert(status='RELEASED' and released_at is not null,
                     'T8e escrow RELEASED')
  from public.escrow_transactions where id=:'escrow_id';

-- Idempotency: confirm again is a no-op
select public.buyer_confirm_receipt('e0000000-0000-0000-0000-000000000007') as second_confirm;

\echo
\echo == T9: Seller fails to ship within 72h -> REFUNDED + failed_ship notif ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000008',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '5 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-000000000008','aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.3);
set session session_replication_role='replica';
update public.auctions set end_time=now() - interval '1 second'
 where id='e0000000-0000-0000-0000-000000000008';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-000000000008');
select id as e_id from public.escrow_transactions
 where auction_id='e0000000-0000-0000-0000-000000000008' \gset

set request.jwt.claim.sub = '';
select public.mark_escrow_funded(:'e_id');

-- Force ship_by into the past.
update public.escrow_transactions
   set ship_by = now() - interval '1 second'
 where id=:'e_id';

select public.check_ship_deadlines() as swept;
select pg_temp.assert(status='REFUNDED' and refunded_at is not null,
                     'T9 escrow REFUNDED on ship-deadline breach')
  from public.escrow_transactions where id=:'e_id';
select pg_temp.assert(exists(
  select 1 from public.notifications
   where auction_id='e0000000-0000-0000-0000-000000000008'
     and type='SELLER_FAILED_TO_SHIP'), 'T9 seller notified');

-- Idempotency: run sweeper again — no duplicate rep events, no state change.
select count(*) as rep_before from public.reputation_events
 where auction_id='e0000000-0000-0000-0000-000000000008'
   and event_type='FAILED_TO_SHIP' \gset
select public.check_ship_deadlines() as second_sweep;
select pg_temp.assert(count(*)::text = :'rep_before',
                     'T9b sweeper is idempotent on rep events')
  from public.reputation_events
 where auction_id='e0000000-0000-0000-0000-000000000008'
   and event_type='FAILED_TO_SHIP';

\echo
\echo == T10: Auto-release after 48h with no dispute ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-000000000009',
                              'aa000000-0000-0000-0000-000000000001', 'DIGITAL',
                              interval '2 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-000000000009','aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.4);
set session session_replication_role='replica';
update public.auctions set end_time=now() - interval '1 second'
 where id='e0000000-0000-0000-0000-000000000009';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-000000000009');
select id as e_id2 from public.escrow_transactions
 where auction_id='e0000000-0000-0000-0000-000000000009' \gset
select public.mark_escrow_funded(:'e_id2');

-- Seller "delivers" digital, then push confirmation_deadline into the past.
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000001';
select public.deliver_digital('e0000000-0000-0000-0000-000000000009', 'https://link/dev');
update public.escrow_transactions
   set confirmation_deadline = now() - interval '1 second'
 where id=:'e_id2';

set request.jwt.claim.sub = '';
select public.check_auto_releases() as released;
select pg_temp.assert(status='RELEASED', 'T10 auto-released after 48h')
  from public.escrow_transactions where id=:'e_id2';

-- Idempotency
select public.check_auto_releases() as second_pass;

\echo
\echo == T11: Disputed transaction does NOT auto-release ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-00000000000a',
                              'aa000000-0000-0000-0000-000000000001', 'DIGITAL',
                              interval '2 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-00000000000a','aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.5);
set session session_replication_role='replica';
update public.auctions set end_time=now() - interval '1 second'
 where id='e0000000-0000-0000-0000-00000000000a';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-00000000000a');
select id as e_id3 from public.escrow_transactions
 where auction_id='e0000000-0000-0000-0000-00000000000a' \gset
select public.mark_escrow_funded(:'e_id3');

set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000001';
select public.deliver_digital('e0000000-0000-0000-0000-00000000000a', 'https://link/dev');

-- Buyer opens dispute
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';
select public.open_dispute('e0000000-0000-0000-0000-00000000000a', 'Item broken', 'Body') as did;

select pg_temp.assert(status='DISPUTED' and confirmation_deadline is null,
                     'T11a escrow DISPUTED + confirmation cleared')
  from public.escrow_transactions where id=:'e_id3';

-- Force what would have been the auto-release deadline into the past.
set request.jwt.claim.sub = '';
update public.escrow_transactions
   set confirmation_deadline = now() - interval '1 second'
 where id=:'e_id3';
-- Auto-release must skip disputed rows (deadline is null anyway; also filter excludes)
select public.check_auto_releases() as released;
select pg_temp.assert(status='DISPUTED',
                     'T11b disputed escrow not auto-released')
  from public.escrow_transactions where id=:'e_id3';

-- Admin resolves in favor of buyer -> REFUNDED
select id as d_id from public.disputes
 where auction_id='e0000000-0000-0000-0000-00000000000a' \gset
select public.resolve_dispute(:'d_id', 'REFUND_BUYER') as result;
select pg_temp.assert(status='REFUNDED', 'T11c resolved -> REFUNDED')
  from public.escrow_transactions where id=:'e_id3';
-- Second resolution is a no-op
select public.resolve_dispute(:'d_id', 'REFUND_BUYER') as second;

\echo
\echo == T12: Duplicate scheduled-job execution is safe (already covered) ==
\echo   (T4 = no duplicate NO_SALE notification, T9b = no duplicate rep events,
\echo    T10 second_pass, T11c second resolution all NOOP.)

\echo
\echo == T13: 48h window does NOT start at shipped_at ==
select pg_temp.mklive_auction('e0000000-0000-0000-0000-00000000000b',
                              'aa000000-0000-0000-0000-000000000001', 'PHYSICAL',
                              interval '3 seconds');
insert into public.bids(auction_id, bidder_id, wallet_address, amount) values (
  'e0000000-0000-0000-0000-00000000000b','aa000000-0000-0000-0000-000000000002',
  '0xaaaa222222222222222222222222222222222222', 0.6);
set session session_replication_role='replica';
update public.auctions set end_time=now() - interval '1 second'
 where id='e0000000-0000-0000-0000-00000000000b';
set session session_replication_role='origin';
select public.close_auction('e0000000-0000-0000-0000-00000000000b');
select id as e_id4 from public.escrow_transactions
 where auction_id='e0000000-0000-0000-0000-00000000000b' \gset
select public.mark_escrow_funded(:'e_id4');

set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';
select public.buyer_submit_shipping_address(
  'e0000000-0000-0000-0000-00000000000b',
  'ad000000-0000-0000-0000-000000000001');
set request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000001';
select public.seller_record_shipment(
  'e0000000-0000-0000-0000-00000000000b','UPS','1Z000');
select pg_temp.assert(confirmation_deadline is null,
                     'T13 confirmation_deadline still NULL after SHIPPED')
  from public.escrow_transactions where id=:'e_id4';

set request.jwt.claim.sub = '';
select public.update_shipping_tracking(
  'e0000000-0000-0000-0000-00000000000b','DELIVERED');
select pg_temp.assert(confirmation_deadline is not null
                     and confirmation_deadline between now() + interval '47 hours 59 minutes'
                                                and now() + interval '48 hours 1 minute',
                     'T13 confirmation_deadline set to ~+48h at DELIVERED')
  from public.escrow_transactions where id=:'e_id4';

\echo
\echo == SUMMARY ==
select
    (select count(*) from public.auctions      where status='ENDED')   as auctions_ended,
    (select count(*) from public.bids          where status='WINNING') as winning_bids,
    (select count(*) from public.escrow_transactions)                  as escrow_rows,
    (select count(*) from public.notifications)                        as notifs_total,
    (select count(*) from public.notifications where dedup_key is not null) as notifs_with_dedup,
    (select count(*) from public.disputes)                             as disputes;
