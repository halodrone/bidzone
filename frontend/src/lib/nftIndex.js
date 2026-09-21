/**
 * BIDZONE Phase 7.2 FINAL (Model B) — Supabase NFT index/cache helpers.
 * The DATABASE IS AN INDEX — on-chain ownerOf is always the source of truth.
 * All writes are insert-own (RLS): the acting user records their own txs.
 * No client UPDATE anywhere — conflicts are ignored (index converges on-chain).
 */
import { supabase } from "@/lib/supabase";
import { MONAD } from "@/lib/monad";

/**
 * Ensure an nft_tokens row exists for (nftContract, tokenId). Never mutates
 * an existing row (RLS has no UPDATE policy — the chain stays authoritative).
 * Returns { row, created } or { row: null } when unconfigured.
 */
export async function ensureNftTokenRow({ session, nftContract, tokenId, tokenUri, name, description, collectionName, attributes = [], ownerWallet }) {
    if (!supabase || !session?.user) return { row: null, created: false };
    const contract = String(nftContract || "").toLowerCase();
    const existing = await supabase
        .from("nft_tokens")
        .select("id, nft_contract, token_id, chain_id, owner_wallet, name")
        .eq("nft_contract", contract)
        .eq("token_id", String(tokenId))
        .eq("chain_id", MONAD.chainId)
        .maybeSingle();
    if (existing?.data) return { row: existing.data, created: false };
    const { data, error } = await supabase
        .from("nft_tokens")
        .insert({
            creator_id: session.user.id,
            nft_contract: contract,
            token_id: String(tokenId),
            token_uri: tokenUri || "",
            name: (name || `Token #${tokenId}`).slice(0, 120),
            description: description || null,
            collection_name: collectionName || null,
            attributes,
            owner_wallet: ownerWallet ? String(ownerWallet).toLowerCase() : null,
            chain_id: MONAD.chainId,
        })
        .select("id")
        .single();
    if (error) {
        // Lost an insert race — the row exists; read it (no UPDATE, no fake).
        if (/duplicate key|23505|unique/i.test(error.message || "")) {
            const again = await supabase
                .from("nft_tokens")
                .select("id, nft_contract, token_id, chain_id")
                .eq("nft_contract", contract)
                .eq("token_id", String(tokenId))
                .eq("chain_id", MONAD.chainId)
                .maybeSingle();
            return { row: again?.data || null, created: false };
        }
        throw error;
    }
    return { row: data, created: true };
}

/** Link an auction to its NFT (nft_auctions — insert-own, unique per auction). */
export async function linkNftAuction({ session, auctionId, nftContract, tokenId }) {
    if (!supabase || !session?.user || !auctionId) return;
    const { error } = await supabase.from("nft_auctions").insert({
        auction_id: auctionId,
        creator_id: session.user.id,
        nft_contract: String(nftContract || "").toLowerCase(),
        token_id: String(tokenId),
        chain_id: MONAD.chainId,
    });
    if (error && !/duplicate key|23505|unique/i.test(error.message || "")) throw error;
}

/**
 * Find the ACTIVE auction linked to a token (via nft_auctions joined to
 * auctions status). Returns { auctionId, status } or null.
 */
export async function findActiveAuctionForToken({ nftContract, tokenId }) {
    if (!supabase) return null;
    try {
        const { data } = await supabase
            .from("nft_auctions")
            .select("auction_id, status:auctions!inner(status, auction_type)")
            .eq("nft_contract", String(nftContract || "").toLowerCase())
            .eq("token_id", String(tokenId))
            .eq("chain_id", MONAD.chainId)
            .order("created_at", { ascending: false })
            .limit(5);
        const rows = data || [];
        const live = rows.find((r) => r.status && ["LIVE", "SCHEDULED"].includes(r.status.status));
        return live ? { auctionId: live.auction_id, status: live.status.status } : null;
    } catch {
        return null;
    }
}

/** Append-only lifecycle event with a REAL tx hash (no fake events). */
export async function recordNftEvent({ session, tokenRowId, eventType, txHash, toWallet }) {
    if (!supabase || !session?.user || !tokenRowId || !txHash) return;
    const { error } = await supabase.from("nft_events").insert({
        token_row_id: tokenRowId,
        event_type: eventType,
        actor_id: session.user.id,
        tx_hash: txHash,
        to_wallet: toWallet ? String(toWallet).toLowerCase() : null,
    });
    if (error && !/duplicate key|23505|unique/i.test(error.message || "")) throw error;
}
