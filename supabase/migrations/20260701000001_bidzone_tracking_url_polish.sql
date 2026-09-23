-- BIDZONE Phase Polish — optional seller tracking URL (additive only)
-- Preserves the existing shipping lifecycle and 2-argument RPC. The 4-argument
-- overload is used only when a seller provides an optional tracking URL.

alter table public.shipping
    add column if not exists tracking_url text;

create or replace function public.seller_record_shipment(
    p_auction_id uuid,
    p_carrier text,
    p_tracking_number text,
    p_tracking_url text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    s record;
begin
    if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
    if p_tracking_number is null or length(btrim(p_tracking_number)) = 0 then
        raise exception 'TRACKING_REQUIRED';
    end if;
    if p_tracking_url is not null and p_tracking_url !~* '^https?://' then
        raise exception 'TRACKING_URL_INVALID';
    end if;

    select * into s from public.shipping where auction_id = p_auction_id for update;
    if not found then raise exception 'SHIPPING_NOT_FOUND'; end if;
    if s.seller_id <> v_uid then raise exception 'NOT_SELLER'; end if;
    if s.tracking_status not in ('PENDING', 'LABEL_CREATED') then
        return 'NOOP_ALREADY_' || s.tracking_status;
    end if;

    update public.shipping
       set carrier = p_carrier,
           tracking_number = p_tracking_number,
           tracking_url = nullif(btrim(p_tracking_url), ''),
           tracking_status = 'SHIPPED',
           shipped_at = now(),
           updated_at = now()
     where auction_id = p_auction_id;

    perform public.emit_notification(
        s.buyer_id, 'ITEM_SHIPPED', p_auction_id, null,
        'Your item has shipped.',
        'shipped:' || p_auction_id::text
    );
    return 'SHIPPED';
end;
$$;

do $$
begin
    revoke all on function public.seller_record_shipment(uuid,text,text,text) from public;
    revoke all on function public.seller_record_shipment(uuid,text,text,text) from anon;
    grant execute on function public.seller_record_shipment(uuid,text,text,text) to authenticated;
    grant execute on function public.seller_record_shipment(uuid,text,text,text) to service_role;
exception when undefined_function then
    null;
end;
$$;
