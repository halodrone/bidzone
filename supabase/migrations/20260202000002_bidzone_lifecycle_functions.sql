-- =============================================================================
-- BIDZONE — Phase 4.2 lifecycle: trusted server-side functions (RPCs)
--
-- All functions are SECURITY DEFINER and run as their owner (typically
-- `postgres` in Supabase), which bypasses RLS on the tables they touch.
-- Callers reach them via:
--   * Supabase RPC — user-callable functions (buyer_submit_shipping_address,
--     seller_record_shipment, buyer_confirm_receipt, open_dispute,
--     deliver_digital). They re-derive the caller from auth.uid().
--   * Service-role only — the cron entry points (close_expired_auctions,
--     check_ship_deadlines, check_auto_releases), the payment stub
--     (mark_escrow_funded), the carrier webhook (update_shipping_tracking),
--     and dispute resolution (resolve_dispute). See GRANT/REVOKE block below.
-- =============================================================================

-- ---------------------------------------------------------------------------
create or replace function public.emit_notification(
    p_user_id    uuid,
    p_type       text,
    p_auction_id uuid,
    p_bid_id     uuid,
    p_message    text,
    p_dedup_key  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if p_dedup_key is not null then
        select id into v_id
          from public.notifications
         where user_id = p_user_id and dedup_key = p_dedup_key
         limit 1;
        if v_id is not null then
            return v_id;
        end if;
    end if;

    insert into public.notifications(user_id, type, auction_id, bid_id, message, dedup_key)
    values (p_user_id, p_type, p_auction_id, p_bid_id, p_message, p_dedup_key)
    returning id into v_id;
    return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.close_auction(p_auction_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    a           record;
    v_winner    record;
    v_escrow_id uuid;
begin
    select id, seller_id, status, end_time, auction_type
      into a
      from public.auctions
     where id = p_auction_id
     for update;

    if not found                                then return 'AUCTION_NOT_FOUND';        end if;
    if a.status <> 'LIVE'                       then return 'NOOP_ALREADY_' || a.status; end if;
    if a.end_time is null or now() < a.end_time then return 'NOOP_NOT_EXPIRED';         end if;

    select b.id, b.bidder_id, b.amount, b.wallet_address, b.created_at
      into v_winner
      from public.bids b
     where b.auction_id = a.id
       and b.status in ('ACTIVE','WINNING')
     order by b.amount desc, b.created_at asc
     limit 1;

    update public.auctions
       set status    = 'ENDED',
           closed_at = now()
     where id = a.id;

    if v_winner.id is null then
        perform public.emit_notification(
            a.seller_id, 'NO_SALE', a.id, null,
            'Your auction ended with no valid bids.',
            'no_sale:' || a.id::text
        );
        return 'ENDED_NO_SALE';
    end if;

    update public.bids
       set status = case when id = v_winner.id then 'WINNING' else 'OUTBID' end
     where auction_id = a.id
       and status in ('ACTIVE','WINNING');

    insert into public.escrow_transactions(
        auction_id, buyer_id, seller_id, amount, status
    ) values (
        a.id, v_winner.bidder_id, a.seller_id, v_winner.amount, 'PENDING'
    )
    returning id into v_escrow_id;

    perform public.emit_notification(
        v_winner.bidder_id, 'AUCTION_WON', a.id, v_winner.id,
        'You won the auction. Complete payment to proceed.',
        'won:' || a.id::text
    );
    perform public.emit_notification(
        a.seller_id, 'AUCTION_SOLD', a.id, v_winner.id,
        'Your auction has a winner. Waiting for buyer payment.',
        'sold:' || a.id::text
    );
    return 'ENDED_WITH_WINNER';
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.close_expired_auctions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    n int := 0;
begin
    for r in
        select id
          from public.auctions
         where status = 'LIVE'
           and end_time is not null
           and end_time <= now()
         order by end_time
         for update skip locked
    loop
        perform public.close_auction(r.id);
        n := n + 1;
    end loop;
    return n;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.mark_escrow_funded(
    p_escrow_id       uuid,
    p_transaction_hash text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    e record;
    a record;
    v_ship_by timestamptz;
begin
    select * into e from public.escrow_transactions where id = p_escrow_id for update;
    if not found              then return 'ESCROW_NOT_FOUND';        end if;
    if e.status = 'FUNDED'    then return 'NOOP_ALREADY_FUNDED';     end if;
    if e.status <> 'PENDING'  then return 'INVALID_STATE_' || e.status; end if;

    select auction_type into a from public.auctions where id = e.auction_id;
    v_ship_by := case when a.auction_type = 'PHYSICAL' then now() + interval '72 hours' end;

    update public.escrow_transactions
       set status           = 'FUNDED',
           funded_at        = now(),
           ship_by          = v_ship_by,
           transaction_hash = coalesce(p_transaction_hash, transaction_hash)
     where id = p_escrow_id;

    perform public.emit_notification(
        e.seller_id, 'PAYMENT_RECEIVED', e.auction_id, null,
        case when a.auction_type = 'PHYSICAL'
             then 'Payment received. Please ship within 72 hours.'
             else 'Payment received. Please deliver the digital item.' end,
        'paid:' || e.auction_id::text
    );
    perform public.emit_notification(
        e.buyer_id, 'PAYMENT_CONFIRMED', e.auction_id, null,
        'Your payment is escrowed. Awaiting seller.',
        'paid_buyer:' || e.auction_id::text
    );
    return 'FUNDED';
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.buyer_submit_shipping_address(
    p_auction_id uuid,
    p_address_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    e     record;
    addr  record;
    v_id  uuid;
begin
    if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

    select * into e
      from public.escrow_transactions
     where auction_id = p_auction_id
     order by created_at desc
     limit 1;
    if not found            then raise exception 'ESCROW_NOT_FOUND'; end if;
    if e.buyer_id <> v_uid  then raise exception 'NOT_BUYER';        end if;
    if e.status <> 'FUNDED' then raise exception 'NOT_FUNDED';       end if;

    select * into addr from public.addresses where id = p_address_id;
    if not found             then raise exception 'ADDRESS_NOT_FOUND'; end if;
    if addr.user_id <> v_uid then raise exception 'ADDRESS_NOT_OWNED'; end if;

    insert into public.shipping(
        auction_id, buyer_id, seller_id, shipping_address_id,
        tracking_status, ship_by
    ) values (
        p_auction_id, e.buyer_id, e.seller_id, p_address_id,
        'PENDING', e.ship_by
    )
    on conflict (auction_id) do update
        set shipping_address_id = excluded.shipping_address_id,
            updated_at          = now()
    returning id into v_id;

    return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.seller_record_shipment(
    p_auction_id     uuid,
    p_carrier        text,
    p_tracking_number text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    s     record;
begin
    if v_uid is null                                    then raise exception 'AUTH_REQUIRED'; end if;
    if p_tracking_number is null
       or length(btrim(p_tracking_number)) = 0          then raise exception 'TRACKING_REQUIRED'; end if;

    select * into s from public.shipping where auction_id = p_auction_id for update;
    if not found                                        then raise exception 'SHIPPING_NOT_FOUND'; end if;
    if s.seller_id <> v_uid                             then raise exception 'NOT_SELLER'; end if;
    if s.tracking_status not in ('PENDING','LABEL_CREATED') then
        return 'NOOP_ALREADY_' || s.tracking_status;
    end if;

    update public.shipping
       set carrier         = p_carrier,
           tracking_number = p_tracking_number,
           tracking_status = 'SHIPPED',
           shipped_at      = now(),
           updated_at      = now()
     where auction_id = p_auction_id;

    perform public.emit_notification(
        s.buyer_id, 'ITEM_SHIPPED', p_auction_id, null,
        'Your item has shipped.',
        'shipped:' || p_auction_id::text
    );
    return 'SHIPPED';
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.update_shipping_tracking(
    p_auction_id uuid,
    p_new_status text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    s record;
    v_deadline timestamptz;
begin
    if p_new_status not in
        ('LABEL_CREATED','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY',
         'DELIVERED','FAILED','RETURNED')
    then
        raise exception 'INVALID_STATUS_%', p_new_status;
    end if;

    select * into s from public.shipping where auction_id = p_auction_id for update;
    if not found                        then raise exception 'SHIPPING_NOT_FOUND'; end if;
    if s.tracking_status = p_new_status then return 'NOOP_UNCHANGED';              end if;
    if s.tracking_status = 'DELIVERED' and p_new_status <> 'DELIVERED' then
        return 'NOOP_TERMINAL_DELIVERED';
    end if;

    update public.shipping
       set tracking_status = p_new_status,
           delivered_at    = case when p_new_status = 'DELIVERED' then now()
                                  else delivered_at end,
           updated_at      = now()
     where auction_id = p_auction_id;

    if p_new_status = 'DELIVERED' then
        v_deadline := now() + interval '48 hours';
        update public.escrow_transactions
           set confirmation_deadline = v_deadline
         where auction_id = p_auction_id and status = 'FUNDED';

        perform public.emit_notification(
            s.buyer_id, 'ITEM_DELIVERED', p_auction_id, null,
            'Item delivered. You have 48 hours to confirm or dispute.',
            'delivered:' || p_auction_id::text
        );
        perform public.emit_notification(
            s.seller_id, 'CONFIRMATION_WINDOW_STARTED', p_auction_id, null,
            'Buyer has 48 hours to confirm receipt.',
            'confirm_started:' || p_auction_id::text
        );
    end if;

    return 'OK_' || p_new_status;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.buyer_confirm_receipt(p_auction_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    e     record;
    s     record;
begin
    if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

    select * into e
      from public.escrow_transactions
     where auction_id = p_auction_id for update;
    if not found              then raise exception 'ESCROW_NOT_FOUND'; end if;
    if e.buyer_id <> v_uid    then raise exception 'NOT_BUYER';        end if;
    if e.status = 'RELEASED'  then return 'NOOP_ALREADY_RELEASED';     end if;
    if e.status <> 'FUNDED'   then raise exception 'INVALID_STATE_%', e.status; end if;

    select * into s from public.shipping where auction_id = p_auction_id;
    if found and s.tracking_status <> 'DELIVERED' then
        raise exception 'NOT_DELIVERED_YET';
    end if;

    update public.escrow_transactions
       set status      = 'RELEASED',
           released_at = now()
     where id = e.id;

    perform public.emit_notification(
        e.seller_id, 'FUNDS_RELEASED', p_auction_id, null,
        'Buyer confirmed receipt. Funds queued for release.',
        'released:' || p_auction_id::text
    );

    insert into public.reputation_events(user_id, auction_id, event_type, points)
    values (e.seller_id, p_auction_id, 'SALE_COMPLETED', 10),
           (e.buyer_id,  p_auction_id, 'PURCHASE_COMPLETED', 5);
    update public.profiles set reputation_score = reputation_score + 10 where id = e.seller_id;
    update public.profiles set reputation_score = reputation_score + 5  where id = e.buyer_id;

    return 'RELEASED';
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.check_ship_deadlines()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    n int := 0;
begin
    for r in
        select e.id as escrow_id, e.auction_id, e.buyer_id, e.seller_id
          from public.escrow_transactions e
         where e.status = 'FUNDED'
           and e.ship_by is not null
           and e.ship_by <= now()
           and not exists (
               select 1 from public.shipping s
                where s.auction_id = e.auction_id
                  and s.tracking_status in ('SHIPPED','IN_TRANSIT',
                                            'OUT_FOR_DELIVERY','DELIVERED')
           )
         for update of e skip locked
    loop
        update public.escrow_transactions
           set status      = 'REFUNDED',
               refunded_at = now()
         where id = r.escrow_id and status = 'FUNDED';

        update public.shipping
           set tracking_status = 'FAILED',
               updated_at      = now()
         where auction_id = r.auction_id;

        insert into public.reputation_events(user_id, auction_id, event_type, points)
        values (r.seller_id, r.auction_id, 'FAILED_TO_SHIP', -15);
        update public.profiles set reputation_score = reputation_score - 15 where id = r.seller_id;

        perform public.emit_notification(
            r.buyer_id, 'REFUND_INITIATED', r.auction_id, null,
            'Seller did not ship in time. Refund initiated.',
            'refund:' || r.auction_id::text
        );
        perform public.emit_notification(
            r.seller_id, 'SELLER_FAILED_TO_SHIP', r.auction_id, null,
            'Shipping deadline passed. Refund initiated to buyer.',
            'failed_ship:' || r.auction_id::text
        );
        n := n + 1;
    end loop;
    return n;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.check_auto_releases()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    n int := 0;
begin
    for r in
        select e.id, e.auction_id, e.buyer_id, e.seller_id
          from public.escrow_transactions e
         where e.status = 'FUNDED'
           and e.confirmation_deadline is not null
           and e.confirmation_deadline <= now()
           and not exists (
               select 1 from public.disputes d
                where d.auction_id = e.auction_id
                  and d.status in ('OPEN','UNDER_REVIEW')
           )
         for update of e skip locked
    loop
        update public.escrow_transactions
           set status      = 'RELEASED',
               released_at = now()
         where id = r.id and status = 'FUNDED';

        insert into public.reputation_events(user_id, auction_id, event_type, points)
        values (r.seller_id, r.auction_id, 'SALE_COMPLETED', 10),
               (r.buyer_id,  r.auction_id, 'PURCHASE_COMPLETED', 5);
        update public.profiles set reputation_score = reputation_score + 10 where id = r.seller_id;
        update public.profiles set reputation_score = reputation_score + 5  where id = r.buyer_id;

        perform public.emit_notification(
            r.seller_id, 'AUTO_RELEASED', r.auction_id, null,
            'Buyer did not respond within 48 hours. Funds auto-released.',
            'auto_release:' || r.auction_id::text
        );
        perform public.emit_notification(
            r.buyer_id, 'AUTO_RELEASED', r.auction_id, null,
            '48-hour window elapsed. Funds released to seller.',
            'auto_release_buyer:' || r.auction_id::text
        );
        n := n + 1;
    end loop;
    return n;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.open_dispute(
    p_auction_id  uuid,
    p_reason      text,
    p_description text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    e     record;
    v_id  uuid;
begin
    if v_uid is null                          then raise exception 'AUTH_REQUIRED'; end if;
    if p_reason is null
       or length(btrim(p_reason)) = 0         then raise exception 'REASON_REQUIRED'; end if;

    select * into e from public.escrow_transactions
     where auction_id = p_auction_id for update;
    if not found                              then raise exception 'ESCROW_NOT_FOUND'; end if;
    if v_uid not in (e.buyer_id, e.seller_id) then raise exception 'NOT_PARTY';        end if;
    if e.status <> 'FUNDED'                   then raise exception 'INVALID_STATE_%', e.status; end if;

    insert into public.disputes(auction_id, buyer_id, seller_id, reason, description, status)
    values (p_auction_id, e.buyer_id, e.seller_id, p_reason, p_description, 'OPEN')
    returning id into v_id;

    update public.escrow_transactions
       set status                = 'DISPUTED',
           dispute_id            = v_id,
           confirmation_deadline = null
     where id = e.id;

    perform public.emit_notification(
        e.buyer_id, 'DISPUTE_OPENED', p_auction_id, null,
        'A dispute has been opened for this transaction.',
        'dispute:' || v_id::text || ':buyer'
    );
    perform public.emit_notification(
        e.seller_id, 'DISPUTE_OPENED', p_auction_id, null,
        'A dispute has been opened for this transaction.',
        'dispute:' || v_id::text || ':seller'
    );
    return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.resolve_dispute(
    p_dispute_id uuid,
    p_resolution text,
    p_notes      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    d record;
    e record;
begin
    if p_resolution not in ('RELEASE_SELLER','REFUND_BUYER','CANCEL_DISPUTE') then
        raise exception 'INVALID_RESOLUTION_%', p_resolution;
    end if;

    select * into d from public.disputes where id = p_dispute_id for update;
    if not found                               then raise exception 'DISPUTE_NOT_FOUND'; end if;
    if d.status not in ('OPEN','UNDER_REVIEW') then return 'NOOP_ALREADY_' || d.status; end if;

    select * into e from public.escrow_transactions
     where auction_id = d.auction_id for update;

    if p_resolution = 'RELEASE_SELLER' then
        update public.escrow_transactions
           set status = 'RELEASED', released_at = now()
         where id = e.id;
        update public.disputes
           set status     = 'RESOLVED_SELLER',
               resolution = coalesce(p_notes, 'Funds released to seller.')
         where id = d.id;
    elsif p_resolution = 'REFUND_BUYER' then
        update public.escrow_transactions
           set status = 'REFUNDED', refunded_at = now()
         where id = e.id;
        update public.disputes
           set status     = 'RESOLVED_BUYER',
               resolution = coalesce(p_notes, 'Funds refunded to buyer.')
         where id = d.id;
    else -- CANCEL_DISPUTE
        update public.escrow_transactions
           set status = 'FUNDED', dispute_id = null
         where id = e.id;
        update public.disputes
           set status     = 'CANCELLED',
               resolution = coalesce(p_notes, 'Dispute cancelled.')
         where id = d.id;
    end if;

    perform public.emit_notification(
        d.buyer_id, 'DISPUTE_RESOLVED', d.auction_id, null,
        'Dispute resolved: ' || p_resolution,
        'dispute_resolved:' || p_dispute_id::text || ':buyer'
    );
    perform public.emit_notification(
        d.seller_id, 'DISPUTE_RESOLVED', d.auction_id, null,
        'Dispute resolved: ' || p_resolution,
        'dispute_resolved:' || p_dispute_id::text || ':seller'
    );
    return 'RESOLVED_' || p_resolution;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.deliver_digital(
    p_auction_id       uuid,
    p_delivery_payload text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    e     record;
    a     record;
begin
    if v_uid is null                     then raise exception 'AUTH_REQUIRED'; end if;
    if p_delivery_payload is null
       or length(btrim(p_delivery_payload)) = 0
                                         then raise exception 'PAYLOAD_REQUIRED'; end if;

    select auction_type, seller_id into a from public.auctions where id = p_auction_id;
    if not found                         then raise exception 'AUCTION_NOT_FOUND'; end if;
    if a.auction_type <> 'DIGITAL'       then raise exception 'NOT_DIGITAL'; end if;
    if a.seller_id <> v_uid              then raise exception 'NOT_SELLER'; end if;

    select * into e from public.escrow_transactions
     where auction_id = p_auction_id for update;
    if not found                         then raise exception 'ESCROW_NOT_FOUND'; end if;
    if e.status <> 'FUNDED'              then raise exception 'INVALID_STATE_%', e.status; end if;
    if e.confirmation_deadline is not null then return 'NOOP_ALREADY_DELIVERED'; end if;

    update public.escrow_transactions
       set confirmation_deadline = now() + interval '48 hours'
     where id = e.id;

    perform public.emit_notification(
        e.buyer_id, 'DIGITAL_DELIVERED', p_auction_id, null,
        'Digital item delivered. You have 48 hours to confirm or dispute.',
        'digital_delivered:' || p_auction_id::text
    );
    return 'DELIVERED';
end;
$$;

-- =============================================================================
-- Permissions
-- =============================================================================
do $$
declare
    fn text;
begin
    for fn in select unnest(array[
        'close_expired_auctions()',
        'close_auction(uuid)',
        'check_ship_deadlines()',
        'check_auto_releases()',
        'mark_escrow_funded(uuid,text)',
        'update_shipping_tracking(uuid,text)',
        'resolve_dispute(uuid,text,text)',
        'emit_notification(uuid,text,uuid,uuid,text,text)'
    ]) loop
        execute format('revoke all on function public.%s from public;', fn);
        begin execute format('revoke all on function public.%s from anon;',           fn); exception when undefined_object then null; end;
        begin execute format('revoke all on function public.%s from authenticated;',  fn); exception when undefined_object then null; end;
        begin execute format('grant execute on function public.%s to service_role;',  fn); exception when undefined_object then null; end;
    end loop;
end;
$$;

do $$
declare
    fn text;
begin
    for fn in select unnest(array[
        'buyer_submit_shipping_address(uuid,uuid)',
        'seller_record_shipment(uuid,text,text)',
        'buyer_confirm_receipt(uuid)',
        'open_dispute(uuid,text,text)',
        'deliver_digital(uuid,text)'
    ]) loop
        begin execute format('grant execute on function public.%s to authenticated;', fn); exception when undefined_object then null; end;
        begin execute format('grant execute on function public.%s to service_role;',  fn); exception when undefined_object then null; end;
    end loop;
end;
$$;
