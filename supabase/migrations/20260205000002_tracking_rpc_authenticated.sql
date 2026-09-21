-- =============================================================================
-- BIDZONE — Phase 7.3b: tracking updates via authenticated RPC (party-gated)
--
-- PROBLEM: update_shipping_tracking had NO party check inside the RPC, so the
-- frontend routed seller tracking updates through the app backend's
-- service-role route (/api/auctions/{id}/shipping/tracking). With no service
-- key configured that route is 503-honest -> tracking could NEVER advance
-- past SHIPPED -> DELIVERED unreachable -> confirm/auto-release unreachable
-- -> settlement permanently gated. (Same deadlock class as 20260205000001.)
--
-- FIX (state-machine ownership, no service-role dependency):
--   * update_shipping_tracking v2 verifies the CALLER is the shipment SELLER
--     (auth.uid() = shipping.seller_id). service_role JWTs (the existing
--     backend route, usable when a service key is ever configured) pass via
--     the role claim. Everyone else: AUTH_REQUIRED / NOT_SELLER.
--   * Grant execute to authenticated (matching the other party RPCs).
--   * NO RLS changes, NO contract changes, frontend switches to the direct
--     party RPC (same pattern as seller_record_shipment).
-- =============================================================================

create or replace function public.update_shipping_tracking(
    p_auction_id uuid,
    p_new_status text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    s         record;
    v_uid     uuid;
    v_deadline timestamptz;
begin
    if p_new_status not in
        ('LABEL_CREATED','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY',
         'DELIVERED','FAILED','RETURNED')
    then
        raise exception 'INVALID_STATUS_%', p_new_status;
    end if;

    select * into s from public.shipping where auction_id = p_auction_id for update;
    if not found then raise exception 'SHIPPING_NOT_FOUND'; end if;

    v_uid := auth.uid();
    if v_uid is not null then
        if s.seller_id <> v_uid then raise exception 'NOT_SELLER'; end if;
    else
        -- service-role path (existing backend route with a service key)
        if coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') <> 'service_role' then
            raise exception 'AUTH_REQUIRED';
        end if;
    end if;

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

-- Party-callable like the rest of the lifecycle RPCs.
begin
    execute format('revoke all on function public.update_shipping_tracking(uuid,text) from public;');
    execute format('revoke all on function public.update_shipping_tracking(uuid,text) from anon;');
    execute format('grant execute on function public.update_shipping_tracking(uuid,text) to authenticated;');
    execute format('grant execute on function public.update_shipping_tracking(uuid,text) to service_role;');
exception when others then null;
end;
