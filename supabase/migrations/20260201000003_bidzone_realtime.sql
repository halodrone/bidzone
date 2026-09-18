-- =============================================================================
-- BIDZONE — Phase 4.1 Supabase Realtime Publication
-- =============================================================================
-- Adds the tables that must stream real-time changes to clients.
-- The frontend realtime implementation is deferred to a later phase; this
-- migration only prepares the database.
-- =============================================================================

-- Ensure the default supabase_realtime publication exists (Supabase creates
-- it automatically, but this is safe to run).
do $$
begin
    if not exists (
        select 1 from pg_publication where pubname = 'supabase_realtime'
    ) then
        create publication supabase_realtime;
    end if;
end;
$$;

-- Emit full row payloads on UPDATE so clients see prior values.
alter table public.auctions      replica identity full;
alter table public.bids          replica identity full;
alter table public.comments      replica identity full;
alter table public.reactions     replica identity full;
alter table public.notifications replica identity full;
alter table public.shipping      replica identity full;

-- Add tables to the realtime publication (idempotent).
do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'auctions', 'bids', 'comments', 'reactions',
            'notifications', 'shipping'
        ])
    loop
        if not exists (
            select 1
              from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public'
               and tablename = t
        ) then
            execute format(
                'alter publication supabase_realtime add table public.%I;', t
            );
        end if;
    end loop;
end;
$$;
