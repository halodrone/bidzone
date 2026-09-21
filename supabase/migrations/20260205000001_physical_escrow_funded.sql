-- =============================================================================
-- BIDZONE — Phase 7.3: Physical escrow funded-at-close (buyer protection fix)
--
-- PROBLEM (user-reported investigation):
--   * close_auction always created escrow_transactions as PENDING
--     ("Complete payment to proceed" — the OLD manual-payment flow).
--   * The PENDING -> FUNDED stamp lives in mark_escrow_funded, which is
--     service_role-ONLY and the fund-stamp backend route is 503-honest
--     (no service key configured) -> every on-chain auction sat in PENDING
--     forever -> the buyer's shipping ladder (address -> ship -> deliver ->
--     confirm -> release) could NEVER start.
--   * Meanwhile an ON-CHAIN winning bid has ALREADY locked the funds in the
--     BIDZONE contract at bid time (msg.value escrowed by the contract), so
--     the DB "awaiting payment" state was a lie for on-chain auctions.
--
-- FIX (state-machine truth, app-level buyer protection):
--   1) close_auction v2: when the winning bid is ON-CHAIN (bids.wallet_address
--      is not null) AND the auction is PHYSICAL/DIGITAL, the escrow row is
--      created directly as FUNDED (funded_at, ship_by = +72h for PHYSICAL,
--      transaction_hash = winning bid tx). Legacy application-level bids keep
--      the honest PENDING flow. NFT auctions are UNTOUCHED (still PENDING rows
--      from close — the NFT escrow contract settles separately).
--   2) One-time IDEMPOTENT backfill: stuck PENDING escrow rows for
--      PHYSICAL/DIGITAL auctions whose winning bid was on-chain -> FUNDED.
--      (Repairs existing auctions, e.g. the user-reported "Motor" case.)
--
--   * NO grants changed (mark_escrow_funded stays service_role-only).
--   * NO RLS changes. NO NFT changes. NO contract changes.
--   * Re-runnable: backfill filters status='PENDING' only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) close_auction v2 (minimal diff from Phase 4.2 original)
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

    select b.id, b.bidder_id, b.amount, b.wallet_address, b.created_at, b.transaction_hash
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

    -- Phase 7.3: on-chain winning bid => funds are ALREADY locked in the
    -- BIDZONE contract escrow — stamp the row FUNDED at close so the buyer
    -- protection ladder (ship -> deliver -> confirm/dispute -> release)
    -- starts immediately. App-level (legacy) bids stay PENDING.
    if v_winner.wallet_address is not null and a.auction_type in ('PHYSICAL','DIGITAL') then
        insert into public.escrow_transactions(
            auction_id, buyer_id, seller_id, amount, status,
            funded_at, ship_by, transaction_hash
        ) values (
            a.id, v_winner.bidder_id, a.seller_id, v_winner.amount, 'FUNDED',
            now(),
            case when a.auction_type = 'PHYSICAL' then now() + interval '72 hours' end,
            v_winner.transaction_hash
        )
        returning id into v_escrow_id;

        perform public.emit_notification(
            v_winner.bidder_id, 'AUCTION_WON', a.id, v_winner.id,
            'You won the auction. Your payment is secured in escrow.',
            'won:' || a.id::text
        );
        perform public.emit_notification(
            a.seller_id, 'AUCTION_SOLD', a.id, v_winner.id,
            case when a.auction_type = 'PHYSICAL'
                 then 'Your auction has a winner. Payment secured — please ship within 72 hours.'
                 else 'Your auction has a winner. Payment secured — please deliver the item.'
                 end,
            'sold:' || a.id::text
        );
    else
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
    end if;
    return 'ENDED_WITH_WINNER';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) One-time idempotent backfill — un-stick existing on-chain-funded auctions
--    (e.g. the reported "Motor" physical auction).
-- ---------------------------------------------------------------------------
update public.escrow_transactions e
   set status           = 'FUNDED',
       funded_at        = now(),
       ship_by          = case when a.auction_type = 'PHYSICAL'
                               then now() + interval '72 hours' end,
       transaction_hash = coalesce(w.transaction_hash, e.transaction_hash)
  from public.auctions a
  join lateral (
        select b.wallet_address, b.transaction_hash
          from public.bids b
         where b.auction_id = a.id
           and b.status = 'WINNING'
           and b.wallet_address is not null
         order by b.amount desc, b.created_at asc
         limit 1
  ) w on true
 where e.auction_id = a.id
   and e.status = 'PENDING'
   and a.auction_type in ('PHYSICAL','DIGITAL');
