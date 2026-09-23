-- =============================================================================
-- BIDZONE — Admin role: profiles.is_admin + admin-gated resolve_dispute
--
-- - Adds `is_admin` boolean column to public.profiles (default false).
-- - Recreates public.resolve_dispute(uuid,text,text) with an admin auth check
--   (auth.uid() must belong to a profile with is_admin=true). Service-role
--   callers (JWT role='service_role') continue to bypass the check so the
--   existing backend / cron functions keep working.
-- - Grants execute on resolve_dispute to `authenticated` (was service_role
--   only). The DB itself enforces admin, so RLS/UI hiding is purely UX.
-- - Adds a read policy on public.disputes so admins can list ALL disputes
--   for review; non-admins retain the existing party-scoped read.
-- - Non-idempotent client discovery of admin state is done via the standard
--   profiles SELECT (RLS already lets a user read their own row).
-- =============================================================================

-- 1. Column ------------------------------------------------------------------
alter table public.profiles
    add column if not exists is_admin boolean not null default false;

-- 2. RPC (recreate with admin gate) ------------------------------------------
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
    d      record;
    e      record;
    v_uid  uuid := auth.uid();
    v_role text := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');
    v_admin boolean := false;
begin
    if p_resolution not in ('RELEASE_SELLER','REFUND_BUYER','CANCEL_DISPUTE') then
        raise exception 'INVALID_RESOLUTION_%', p_resolution;
    end if;

    -- Admin auth: either service_role JWT (backend/cron) OR authenticated user
    -- whose profile row has is_admin = true. Everyone else: NOT_ADMIN.
    if v_role = 'service_role' then
        v_admin := true;
    elsif v_uid is not null then
        select is_admin into v_admin from public.profiles where id = v_uid;
        v_admin := coalesce(v_admin, false);
    end if;
    if not v_admin then raise exception 'NOT_ADMIN'; end if;

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

-- 3. Grants ------------------------------------------------------------------
do $$
begin
    revoke all on function public.resolve_dispute(uuid,text,text) from public;
    begin revoke all on function public.resolve_dispute(uuid,text,text) from anon; exception when undefined_object then null; end;
    grant execute on function public.resolve_dispute(uuid,text,text) to authenticated;
    grant execute on function public.resolve_dispute(uuid,text,text) to service_role;
end;
$$;

-- 4. RLS: admin read-all on disputes (additive, does not weaken party read) --
do $$
begin
    -- Only add if not already present. The existing party-scoped SELECT policy
    -- is preserved; this one is OR'd by Postgres RLS so admins see all rows.
    if not exists (
        select 1 from pg_policies
         where schemaname = 'public'
           and tablename  = 'disputes'
           and policyname = 'disputes_select_admin'
    ) then
        create policy disputes_select_admin on public.disputes
            for select
            using (
                exists (
                    select 1 from public.profiles p
                     where p.id = auth.uid() and p.is_admin = true
                )
            );
    end if;
end;
$$;
