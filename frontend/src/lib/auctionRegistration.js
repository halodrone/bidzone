import { supabase } from "@/lib/supabase";
import { MONAD } from "@/lib/monad";
import {
    auctionIdFromUuid,
    createAuctionOnchain,
    readAuctionStatus,
    isOnchainAvailable,
} from "@/lib/bidzoneAuction";

/**
 * Phase 6.5b — reliable on-chain auction registration + reconciliation.
 *
 * Guarantees:
 *  - a Supabase UUID ALWAYS maps to exactly one deterministic on-chain id
 *    (keccak256 of the raw UUID string) — duplicate protection: the contract
 *    is READ first; if the auction already exists we NEVER submit another
 *    create transaction, we reconcile the DB row instead;
 *  - Supabase on-chain fields are written ONLY after transaction confirmation
 *    (never before); a failed/reverted tx leaves the row recoverable;
 *  - works for both the publish-time flow and the owner "Register On-Chain"
 *    recovery retry (Phase 6.5b).
 *
 * @param {object} p
 * @param {object} p.wallet       ready Privy embedded wallet
 * @param {object} p.auction      Supabase auction row (id, starting_bid,
 *                                minimum_increment, start_time, end_time,
 *                                anti_sniping_seconds, contract_auction_id)
 * @returns {Promise<{reconciled:boolean, hash:string|null, contractAuctionId:string}>}
 */
export async function registerOrReconcileAuction({ wallet, auction }) {
    if (!isOnchainAvailable()) {
        throw new Error("On-chain registration is not configured (contract address missing)");
    }
    if (!wallet) {
        throw new Error("Embedded wallet is not ready — open the auction room again once provisioning completes");
    }

    const idHex = auctionIdFromUuid(auction.id);

    // Reconcile path — the auction exists on-chain: NEVER re-create, sync the DB row.
    async function reconcile() {
        if (!auction.contract_auction_id) {
            const { error } = await supabase
                .from("auctions")
                .update({
                    contract_auction_id: idHex,
                    chain_id: MONAD.chainId,
                    contract_address: MONAD.contractAddress,
                })
                .eq("id", auction.id);
            if (error) {
                throw new Error(
                    "Auction already exists on-chain, but Supabase reconciliation failed: " + error.message
                );
            }
        }
        return { reconciled: true, hash: null, contractAuctionId: idHex };
    }

    // Duplicate protection — read BEFORE any transaction.
    const status = await readAuctionStatus(auction.id);
    if (status != null && status !== 0n) {
        return reconcile();
    }
    // Second confirmatory read: the public RPC can serve STALE pre-registration
    // state from a lagging node (observed: a re-click then submitted a duplicate
    // create that reverted and burned gas). If either read sees the auction
    // on-chain, reconcile instead of re-creating.
    const status2 = await readAuctionStatus(auction.id).catch(() => null);
    if (status2 != null && status2 !== 0n) {
        return reconcile();
    }

    // Status.None — submit the real create transaction and wait for confirmation.
    const { hash, receipt } = await createAuctionOnchain({
        wallet,
        uuid: auction.id,
        startingBidMon: auction.starting_bid,
        minimumIncrementMon: auction.minimum_increment,
        startTime: auction.start_time || auction.created_at,
        endTime: auction.end_time,
        antiSnipeSeconds: auction.anti_sniping_seconds || 10,
    });
    if (receipt && receipt.status && receipt.status !== "success") {
        throw new Error("Registration transaction reverted on-chain");
    }

    // ONLY after confirmation: persist the on-chain linkage.
    const { error } = await supabase
        .from("auctions")
        .update({
            creation_tx_hash: hash,
            contract_auction_id: idHex,
            chain_id: MONAD.chainId,
            contract_address: MONAD.contractAddress,
        })
        .eq("id", auction.id);
    if (error) {
        throw new Error(
            "Registered on-chain (tx " + hash + "), but the Supabase update failed: " + error.message
        );
    }
    return { reconciled: false, hash, contractAuctionId: idHex };
}
