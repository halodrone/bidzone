# BIDZONE — Phase 4.1 Database (Supabase)

Ready-to-run SQL migration files for the Phase 4.1 data layer.
No smart contracts, no on-chain calls, no frontend changes.

## Files (apply in order)

1. `migrations/20260201000001_bidzone_schema.sql` — tables, indexes, constraints, triggers
2. `migrations/20260201000002_bidzone_rls.sql`    — Row Level Security policies
3. `migrations/20260201000003_bidzone_realtime.sql` — realtime publication
4. `migrations/20260201000004_bidzone_dev_seed.sql` — `[DEV]` demo data (optional)

### Apply
```bash
# Supabase CLI (recommended)
supabase db push

# OR paste each file into Supabase Studio → SQL Editor and run in order.
```

Seed file note: `profiles.id` references `auth.users(id)`. Create two throwaway
auth users first (Studio → Authentication → Add user) using the UUIDs at the
top of the seed file, or edit the UUIDs to match users you already have.

---

## Tables (14)

| Table | Purpose | PK | Key FKs |
|---|---|---|---|
| `profiles`            | User profile, wallet, reputation | `id` = `auth.users.id` | — |
| `addresses`           | **Private** shipping addresses | uuid | `user_id → profiles` |
| `auctions`            | Auction listings & state | uuid | `seller_id → profiles` |
| `auction_items`       | Media (images/videos) per auction | uuid | `auction_id → auctions` (CASCADE) |
| `bids`                | Public bid history | uuid | `auction_id`, `bidder_id` |
| `watchlist`           | User follows an auction | uuid | `user_id`, `auction_id` — unique together |
| `reactions`           | Emoji-style reactions | uuid | `auction_id`, `user_id` — unique on (auction, user, type) |
| `comments`            | Public chat on auction | uuid | `auction_id`, `user_id` |
| `notifications`       | Per-user inbox | uuid | `user_id`, `auction_id?`, `bid_id?` |
| `shipping`            | Fulfillment record (physical items) | uuid | `auction_id` (unique), `buyer_id`, `seller_id`, `shipping_address_id` |
| `escrow_transactions` | Mirror of on-chain Monad escrow | uuid | `auction_id`, `buyer_id`, `seller_id` |
| `disputes`            | Buyer/seller disputes | uuid | `auction_id`, `buyer_id`, `seller_id` |
| `reputation_events`   | Append-only rep ledger | uuid | `user_id`, `auction_id?` |

### Financial precision
All monetary fields use `NUMERIC(38, 18)` to support wei-level Monad token
precision. **Never** change these to `float`, `real`, or `double precision`.

### Status enums (CHECK constraints)
- `auctions.status`: `DRAFT | SCHEDULED | LIVE | ENDED | CANCELLED`
- `auctions.auction_type`: `DIGITAL | PHYSICAL`
- `bids.status`: `ACTIVE | OUTBID | WINNING | REFUNDED | CANCELLED`
- `escrow_transactions.status`: `PENDING | FUNDED | RELEASED | REFUNDED | DISPUTED | CANCELLED`
- `disputes.status`: `OPEN | UNDER_REVIEW | RESOLVED_BUYER | RESOLVED_SELLER | CANCELLED`
- `shipping.tracking_status`: `PENDING | LABEL_CREATED | SHIPPED | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | FAILED | RETURNED`
- `auction_items.media_type`: `IMAGE | VIDEO`

### Indexes
Indexes exist on every field you asked for and the common query paths:
`auctions(seller_id, status, end_time, category, (status,end_time))`,
`bids(auction_id, bidder_id, status, lower(wallet_address), (auction_id, amount desc))`,
`watchlist(user_id, auction_id)`, `reactions(auction_id, user_id)`,
`comments(auction_id, created_at desc)`, `notifications(user_id, created_at desc)` +
partial unread index, `shipping(buyer_id, seller_id, tracking_status)`,
`escrow_transactions(auction_id, buyer_id, seller_id, status)`,
`disputes(auction_id, buyer_id, seller_id, status)`,
`reputation_events(user_id, created_at desc)`.

### Uniqueness
- `profiles.username` — case-insensitive via `citext`
- `profiles.wallet_address` — case-insensitive via `unique index on lower(wallet_address)`
- `bids.transaction_hash` — unique when non-null
- `escrow_transactions.transaction_hash` — unique when non-null
- `watchlist(user_id, auction_id)` — prevents duplicate watchlist entries
- `reactions(auction_id, user_id, reaction_type)` — prevents duplicate reactions
- `addresses(user_id) where is_default` — one default address per user
- `shipping(auction_id)` — one shipping row per auction

### Triggers
- `set_updated_at` on `profiles / addresses / auctions / shipping / escrow_transactions / disputes`
- `on_auth_user_created` (on `auth.users`) → auto-inserts a `profiles` row
- `validate_bid_before_insert` on `bids` → enforces: auction LIVE, within
  window, seller cannot bid, `amount >= current_bid + minimum_increment`,
  forces `status = 'ACTIVE'`
- `after_bid_insert` on `bids` → marks prior bids `OUTBID`, marks new bid
  `WINNING`, updates `auctions.current_bid`, applies anti-sniping extension

---

## Row Level Security (summary)

Every table has RLS **enabled**. `addresses`, `shipping`, `escrow_transactions`,
`disputes` additionally use **FORCE ROW LEVEL SECURITY**.

| Table | Public SELECT | Owner mutations | Notes |
|---|---|---|---|
| `profiles`          | ✅ all rows | INSERT/UPDATE own only | No client DELETE |
| `addresses`         | ❌ **never** | Full CRUD on own | **Private** — never publicly queryable |
| `auctions`          | ✅ except DRAFT (seller-only) | Seller INSERT/UPDATE own; DELETE only if `DRAFT` | `seller_id` immutable via `with check` |
| `auction_items`     | ✅ when parent auction visible | Seller ALL on own auctions | — |
| `bids`              | ✅ full transparency | INSERT own only | **No client UPDATE/DELETE** — trigger + service role only |
| `watchlist`         | Owner only | INSERT / DELETE own | — |
| `reactions`         | ✅ | INSERT / DELETE own | — |
| `comments`          | ✅ | INSERT / UPDATE / DELETE own | — |
| `notifications`     | Owner only | UPDATE own (for `is_read`) | Server writes rows |
| `shipping`          | Buyer + seller only | ❌ | **Server-side required** (see below) |
| `escrow_transactions` | Buyer + seller only | ❌ | **Server-side required** — mirrors Monad state |
| `disputes`          | Buyer + seller only | INSERT if party to auction | Resolution via admin/service role |
| `reputation_events` | ✅ (auditable) | ❌ | **Server-side required** — append-only from verified events |

### Operations intentionally NOT permitted from the client (require service role / edge functions in a later phase)
- Any UPDATE / DELETE on `bids` (status transitions, refunds, cancellation)
- Any INSERT / UPDATE / DELETE on `escrow_transactions`
- Any INSERT / UPDATE / DELETE on `shipping` (must verify buyer==winner and address ownership)
- UPDATE / DELETE on `disputes` (moderation)
- Any INSERT / UPDATE / DELETE on `reputation_events`
- INSERT / DELETE on `notifications`

These are marked as such in `20260201000002_bidzone_rls.sql`. Do **not** add
permissive client policies for them without an audit — doing so would break
the transparency and integrity guarantees of BIDZONE.

---

## Realtime

Publication `supabase_realtime` includes:
`auctions`, `bids`, `comments`, `reactions`, `notifications`, `shipping`.

Each of those tables uses `REPLICA IDENTITY FULL` so UPDATE events carry the
previous row values (useful for animating "outbid" transitions).

Frontend realtime wiring is **not** implemented in this phase.

---

## Verification checklist (results)

- [x] All FKs present (see table above). Cascading is chosen per table: media/watchlist/reactions/comments cascade with the auction; profiles/auctions/shipping/escrow reference `restrict` to prevent silent data loss.
- [x] `created_at` / `updated_at` present where appropriate; `updated_at` auto-maintained by trigger.
- [x] Indexes on every frequently-queried field listed in the spec.
- [x] Duplicate watchlist prevented via `unique (user_id, auction_id)`.
- [x] `auction_type` / all `status` fields constrained via `CHECK`.
- [x] Financial values use `NUMERIC(38,18)` — **no floating-point** anywhere in the schema.
- [x] Blockchain hashes stored as `TEXT`.
- [x] Wallet addresses unique case-insensitively (`unique index on lower(wallet_address)`).
- [x] No column for private keys or seed phrases.
- [x] RLS enabled on every table; FORCE RLS on `addresses`, `shipping`, `escrow_transactions`, `disputes`.
- [x] Private `addresses` rows readable only by owner — cannot be publicly queried, and are not exposed via `shipping` (only the `shipping_address_id` UUID is stored).
- [x] Users cannot arbitrarily modify bids (no client UPDATE/DELETE policy; INSERT gated by SECURITY DEFINER trigger).
- [x] Users cannot arbitrarily modify escrow or reputation events (no client mutation policies).
- [x] Realtime configured for the 6 required tables.
- [x] Existing UI untouched (fresh start confirmed).

---

## Items requiring your approval

1. **profiles.id = auth.users.id (1:1 mapping).** Any Supabase auth user
   automatically gets a profile row via `handle_new_user()` trigger.
   *Approve or say if you want profiles decoupled from `auth.users`.*
2. **Trigger-based bid validation.** `tg_validate_bid` enforces auction
   rules in the DB so a client that talks directly to Supabase cannot bypass
   them before the Monad settlement layer exists.
   *Approve, or say if you want validation deferred entirely to the smart
   contract phase.*
3. **`auctions.current_bid` is trigger-managed.** RLS lets a seller
   `UPDATE auctions`, but `current_bid` is written only by `tg_after_bid_insert`
   in practice. If you want a hard guarantee, we should add a column-level
   restriction in a follow-up phase.
4. **Anti-sniping default = 0 seconds.** Sellers set per-auction.
   *Confirm this default, or specify a global minimum (e.g., 30s).*
5. **`allowed_regions` = `text[]` with `{'GLOBAL'}` convention.** No ISO
   validation yet. *Confirm this is fine for Phase 4.1.*
6. **Reactions uniqueness = one row per (auction, user, reaction_type).**
   i.e., a user can leave multiple *different* reactions on an auction.
   *Confirm, or restrict to a single reaction per (auction, user).*
7. **Comment length limits.** Non-empty, `<= 1000` chars.
   *Confirm or change.*
8. **No client policies for escrow / shipping / reputation / bid updates.**
   These need server-side endpoints (edge functions or a backend service)
   in a later phase. *Acknowledged & approved?*
9. **Seed data assumes you'll create two auth users with UUIDs**
   `00000000-…-01` and `…-02`. Otherwise the seed FK will fail.
   *Confirm you'll create them, or skip seed file 4.*
