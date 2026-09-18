-- =============================================================================
-- BIDZONE — Phase 6.1 Storage: private `auction-media` bucket + Storage RLS
--
-- ADDITIVE ONLY. No existing BIDZONE table/policy/trigger is modified.
-- Bucket creation via SQL row insert is the documented equivalent of the
-- dashboard toggle; the storage service reads buckets from storage.buckets.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Bucket: auction-media — PRIVATE, MIME whitelist, 100 MB bucket cap.
--    Per-type limits (images 10 MB / videos 100 MB) are enforced in the
--    application layer; the bucket-level cap is the hard ceiling.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'auction-media',
    'auction-media',
    false,
    104857600,  -- 100 MB hard ceiling (video max); images capped at 10 MB client-side
    array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm'
    ]
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Helpers (guard against invalid uuid folders so policies never error out)
-- -----------------------------------------------------------------------------
create or replace function public.bz_media_folder_is_uuid(name text)
returns boolean
language sql
stable
as $$
    select (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create or replace function public.bz_media_auction_id(name text)
returns uuid
language sql
stable
as $$
    select case when public.bz_media_folder_is_uuid(name)
        then ((storage.foldername(name))[1])::uuid
        else null end
$$;

-- -----------------------------------------------------------------------------
-- 2) READ — media of a visible auction.
--    Public auctions (non-DRAFT) are publicly viewable (matches auctions RLS,
--    so Home cards / Auction Room render for visitors via signed URLs).
--    DRAFT media is visible only to the owning seller. Bucket stays private.
-- -----------------------------------------------------------------------------
drop policy if exists bidzone_media_read on storage.objects;
create policy bidzone_media_read
    on storage.objects for select
    to anon, authenticated
using (
    bucket_id = 'auction-media'
    and exists (
        select 1
          from public.auctions a
         where a.id = public.bz_media_auction_id(name)
           and (a.status <> 'DRAFT' or a.seller_id = auth.uid())
    )
);

-- -----------------------------------------------------------------------------
-- 3) WRITE — authenticated sellers, OWN auctions only.
--    Ownership is verified against the auctions record via the auction_id
--    folder in the object path (never trusted from client metadata alone).
--    Seller A cannot touch Seller B's folder because the subquery resolves
--    the real auction owner for the folder in the path.
-- -----------------------------------------------------------------------------
drop policy if exists bidzone_media_insert_owner on storage.objects;
create policy bidzone_media_insert_owner
    on storage.objects for insert
    to authenticated
with check (
    bucket_id = 'auction-media'
    and exists (
        select 1
          from public.auctions a
         where a.id = public.bz_media_auction_id(name)
           and a.seller_id = auth.uid()
    )
);

drop policy if exists bidzone_media_update_owner on storage.objects;
create policy bidzone_media_update_owner
    on storage.objects for update
    to authenticated
using (
    bucket_id = 'auction-media'
    and exists (
        select 1
          from public.auctions a
         where a.id = public.bz_media_auction_id(name)
           and a.seller_id = auth.uid()
    )
)
with check (
    bucket_id = 'auction-media'
    and exists (
        select 1
          from public.auctions a
         where a.id = public.bz_media_auction_id(name)
           and a.seller_id = auth.uid()
    )
);

drop policy if exists bidzone_media_delete_owner on storage.objects;
create policy bidzone_media_delete_owner
    on storage.objects for delete
    to authenticated
using (
    bucket_id = 'auction-media'
    and exists (
        select 1
          from public.auctions a
         where a.id = public.bz_media_auction_id(name)
           and a.seller_id = auth.uid()
    )
);
-- =============================================================================
-- End of Phase 6.1 storage migration
-- =============================================================================
