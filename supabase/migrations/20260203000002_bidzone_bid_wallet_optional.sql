-- =============================================================================
-- BIDZONE Phase 6.4 — application-level bids may precede wallet provisioning.
--
-- bids.wallet_address becomes NULLABLE so an authenticated application-level
-- bid (Phase 6.4, before the embedded wallet exists) can be stored honestly
-- — we do NOT fabricate placeholder addresses. When the embedded wallet
-- exists, the real address is written with the bid. No other change.
-- =============================================================================

alter table public.bids
    alter column wallet_address drop not null;
-- =============================================================================
-- End of migration
-- =============================================================================
