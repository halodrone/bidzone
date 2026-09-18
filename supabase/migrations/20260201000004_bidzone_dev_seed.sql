-- =============================================================================
-- BIDZONE — Phase 4.1 Development / Demo Seed Data
-- =============================================================================
-- DEV ONLY. Every row is clearly marked with the prefix "[DEV]".
-- No fake financial balances, no fake blockchain transactions.
-- Deterministic UUIDs so re-running the migration is idempotent.
-- =============================================================================
-- NOTE: profiles.id references auth.users(id). In a real Supabase project the
-- corresponding auth.users rows must be created first via
-- `supabase auth admin create-user ...` (or the SDK) BEFORE running this seed,
-- otherwise the FK will reject the insert. For local testing you can create
-- two throwaway auth users manually and then substitute their UUIDs below, or
-- comment out the profile inserts and use the UI signup flow.
-- =============================================================================

-- ---------- DEMO PROFILES ----------------------------------------------------
-- These UUIDs are placeholders. Replace with real auth.users(id) values or
-- create auth users with these exact UUIDs before applying this seed.
--   Seller demo: 00000000-0000-0000-0000-000000000001
--   Bidder demo: 00000000-0000-0000-0000-000000000002

insert into public.profiles
    (id, wallet_address, username, display_name, bio, reputation_score)
values
    ('00000000-0000-0000-0000-000000000001',
     '0x1111111111111111111111111111111111111111',
     'dev_seller', '[DEV] Seller One',
     '[DEV] Demo seller account — safe to delete.', 0),
    ('00000000-0000-0000-0000-000000000002',
     '0x2222222222222222222222222222222222222222',
     'dev_bidder', '[DEV] Bidder One',
     '[DEV] Demo bidder account — safe to delete.', 0)
on conflict (id) do nothing;

-- ---------- DEMO AUCTIONS ----------------------------------------------------
insert into public.auctions
    (id, seller_id, title, description, category, condition,
     auction_type, starting_bid, current_bid, minimum_increment,
     start_time, end_time, anti_sniping_seconds, status, allowed_regions)
values
    -- LIVE physical auction
    ('10000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000001',
     '[DEV] Vintage Film Camera',
     '[DEV] Demo listing. A well-loved 35mm rangefinder in working condition.',
     'Cameras', 'Used - Good', 'PHYSICAL',
     0.100000000000000000, null, 0.010000000000000000,
     now() - interval '10 minutes',
     now() + interval '1 hour',
     30, 'LIVE', array['GLOBAL']),

    -- SCHEDULED digital auction
    ('10000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-000000000001',
     '[DEV] Digital Artwork — Pixel Skyline',
     '[DEV] Demo listing. Original 1:1 pixel-art edition.',
     'Digital Art', 'New', 'DIGITAL',
     0.050000000000000000, null, 0.005000000000000000,
     now() + interval '1 day',
     now() + interval '2 days',
     15, 'SCHEDULED', array['GLOBAL']),

    -- DRAFT auction (seller-only visibility)
    ('10000000-0000-0000-0000-000000000003',
     '00000000-0000-0000-0000-000000000001',
     '[DEV] Draft — Rare Trading Card',
     '[DEV] Draft demo listing not yet published.',
     'Collectibles', 'Used - Like New', 'PHYSICAL',
     0.250000000000000000, null, 0.020000000000000000,
     null, null, 0, 'DRAFT', array['GLOBAL'])
on conflict (id) do nothing;

-- ---------- DEMO AUCTION MEDIA ----------------------------------------------
insert into public.auction_items (id, auction_id, media_url, media_type, sort_order)
values
    ('20000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001',
     'https://placehold.co/1200x800?text=%5BDEV%5D+Film+Camera',
     'IMAGE', 0),
    ('20000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000002',
     'https://placehold.co/1200x800?text=%5BDEV%5D+Pixel+Skyline',
     'IMAGE', 0)
on conflict (id) do nothing;
