import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { REACT_APP_BACKEND_URL } from "./backendUrl";

/**
 * BIDZONE Phase 7 — Physical auction fulfillment helpers.
 *
 * Everything here REUSES the existing Phase 4.1/4.2 architecture:
 *  - addresses table (private, RLS own-select/insert)
 *  - escrow_transactions / shipping / disputes (party-read RLS)
 *  - the existing SECURITY DEFINER lifecycle RPCs (user-callable ones are
 *    granted to `authenticated`)
 *  - service-role mutations (escrow fund stamp, manual tracking updates)
 *    go through the app's FastAPI backend, which verifies the caller's
 *    Supabase JWT + party role before invoking the existing RPCs.
 */

/* ------------------------------------------------------------------ */
/* Labels / tones for the existing tracking_status enum values:       */
/* PENDING, LABEL_CREATED, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY,     */
/* DELIVERED, FAILED, RETURNED                                        */
/* ------------------------------------------------------------------ */
export const TRACKING_LABELS = {
    PENDING: "Preparing",
    LABEL_CREATED: "Label created",
    SHIPPED: "Shipped",
    IN_TRANSIT: "In transit",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    FAILED: "Failed to ship",
    RETURNED: "Returned",
};

export const ESCROW_LABELS = {
    PENDING: "Awaiting payment",
    FUNDED: "Payment secured",
    RELEASED: "Completed",
    REFUNDED: "Refunded",
    DISPUTED: "Disputed",
    CANCELLED: "Cancelled",
};

export function trackingLabel(status) {
    return TRACKING_LABELS[status] || status || "—";
}

export function escrowLabel(status) {
    return ESCROW_LABELS[status] || status || "—";
}

/** Tailwind classes per status — BIDZONE dark + purple language. */
export function statusTone(status) {
    switch (status) {
        case "FUNDED":
        case "PAYMENT_SECURING":
            return "border-[hsl(var(--bz-purple)/0.55)] bg-[hsl(var(--bz-purple)/0.12)] text-white";
        case "SHIPPED":
        case "IN_TRANSIT":
        case "OUT_FOR_DELIVERY":
        case "LABEL_CREATED":
            return "border-[hsl(var(--bz-blue)/0.5)] bg-[hsl(var(--bz-blue)/0.12)] text-white";
        case "DELIVERED":
            return "border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] text-white";
        case "RELEASED":
            return "border-[hsl(var(--bz-green)/0.5)] bg-[hsl(var(--bz-green)/0.12)] text-white";
        case "DISPUTED":
        case "FAILED":
            return "border-[hsl(var(--bz-red)/0.5)] bg-[hsl(var(--bz-red)/0.12)] text-white";
        case "REFUNDED":
            return "border-white/20 bg-white/[0.05] text-white/80";
        default:
            return "border-white/[0.12] bg-white/[0.03] text-white/70";
    }
}

/**
 * Informational fee breakdown matching the EXISTING settlement logic
 * (FEE_BPS = 250 → 2.5% platform / 97.5% seller). Display only — the
 * contract remains the source of truth for actual settlement amounts.
 */
export function feeBreakdown(amount) {
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) return { fee: "0", received: "0" };
    const fee = n * 0.025;
    return {
        fee: fee.toFixed(4).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m)),
        received: (n - fee).toFixed(4),
    };
}

/* ------------------------------------------------------------------ */
/* Addresses (existing private table)                                 */
/* ------------------------------------------------------------------ */
export function useMyAddresses() {
    return useQuery({
        queryKey: ["my-addresses"],
        enabled: Boolean(supabase),
        queryFn: async () => {
            if (!supabase) return [];
            const { data, error } = await supabase
                .from("addresses")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data ?? [];
        },
    });
}

export async function insertMyAddress(payload, userId) {
    if (!supabase) throw new Error("Supabase is not configured");
    // RLS insert policy checks user_id = auth.uid() — the column must be set.
    const { data, error } = await supabase
        .from("addresses")
        .insert({ ...payload, user_id: userId })
        .select("id")
        .single();
    if (error) throw new Error(error.message || "Could not save address");
    return data;
}

/* ------------------------------------------------------------------ */
/* My Activity data — bids / purchases / sales                        */
/* ------------------------------------------------------------------ */
const AUCTION_CARD_SELECT = `
    id, title, category, condition, auction_type, status,
    starting_bid, current_bid, minimum_increment, end_time,
    allowed_regions, shipping_origin,
    seller:profiles!auctions_seller_id_fkey ( id, username, display_name, wallet_address ),
    auction_items ( media_url, media_type, sort_order )
`;

export function useMyBids(enabled = true) {
    return useQuery({
        queryKey: ["my-activity-bids"],
        enabled: Boolean(supabase) && enabled,
        queryFn: async () => {
            if (!supabase) return [];
            const { data, error } = await supabase
                .from("bids")
                .select(
                    `id, amount, status, created_at, transaction_hash, auction_id,
                     auction:auctions ( ${AUCTION_CARD_SELECT} )`
                )
                .order("created_at", { ascending: false })
                .limit(25);
            if (error) throw error;
            return data ?? [];
        },
    });
}

export function useMyPurchases(enabled = true) {
    return useQuery({
        queryKey: ["my-activity-purchases"],
        enabled: Boolean(supabase) && enabled,
        queryFn: async () => {
            if (!supabase) return [];
            // Purchases = my escrow rows (party-read RLS). shipping rows are
            // fetched separately (no direct FK between escrow_transactions and
            // shipping) and stitched by auction_id.
            const { data: escrows, error } = await supabase
                .from("escrow_transactions")
                .select(
                    `id, auction_id, amount, status, created_at, funded_at, ship_by,
                     confirmation_deadline, released_at, refunded_at,
                     auction:auctions ( ${AUCTION_CARD_SELECT} )`
                )
                .order("created_at", { ascending: false })
                .limit(25);
            if (error) throw error;
            const rows = escrows ?? [];
            if (rows.length === 0) return [];
            const ids = rows.map((r) => r.auction_id);
            const { data: shippings } = await supabase
                .from("shipping")
                .select(
                    "auction_id, carrier, tracking_number, tracking_status, shipped_at, delivered_at, ship_by"
                )
                .in("auction_id", ids);
            const shipByAuction = new Map((shippings ?? []).map((s) => [s.auction_id, s]));
            return rows.map((e) => ({
                ...e,
                shipping: shipByAuction.get(e.auction_id) || null,
            }));
        },
    });
}

export function useMySales(enabled = true) {
    return useQuery({
        queryKey: ["my-activity-sales"],
        enabled: Boolean(supabase) && enabled,
        queryFn: async () => {
            if (!supabase) return [];
            // Sales = my auctions (public select) + their escrow/shipping rows
            // (party-read RLS only returns rows where I am seller).
            const { data: auctions, error } = await supabase
                .from("auctions")
                .select(AUCTION_CARD_SELECT)
                .order("created_at", { ascending: false })
                .limit(25);
            if (error) throw error;
            const rows = auctions ?? [];
            if (rows.length === 0) return [];
            const ids = rows.map((r) => r.id);
            const [escrows, shippings] = await Promise.all([
                supabase
                    .from("escrow_transactions")
                    .select(
                        "id, auction_id, amount, status, funded_at, ship_by, confirmation_deadline, released_at, refunded_at"
                    )
                    .in("auction_id", ids),
                supabase
                    .from("shipping")
                    .select(
                        "auction_id, carrier, tracking_number, tracking_status, shipped_at, delivered_at, ship_by"
                    )
                    .in("auction_id", ids),
            ]);
            const escByAuction = new Map((escrows.data ?? []).map((e) => [e.auction_id, e]));
            const shipByAuction = new Map((shippings.data ?? []).map((s) => [s.auction_id, s]));
            return rows.map((a) => ({
                ...a,
                escrow: escByAuction.get(a.id) || null,
                shipping: shipByAuction.get(a.id) || null,
            }));
        },
    });
}

/* ------------------------------------------------------------------ */
/* Existing user-callable lifecycle RPCs (Phase 4.2)                  */
/* ------------------------------------------------------------------ */
async function rpc(fn, payload) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data, error } = await supabase.rpc(fn, payload);
    if (error) throw new Error(error.message || `${fn} failed`);
    return data;
}

/** Buyer attaches one of their OWN addresses to the (FUNDED) escrow. */
export function submitShippingAddress(auctionId, addressId) {
    return rpc("buyer_submit_shipping_address", {
        p_auction_id: auctionId,
        p_address_id: addressId,
    });
}

/** Seller marks the shipment SHIPPED (carrier + tracking number required). */
export function recordShipment(auctionId, carrier, trackingNumber) {
    return rpc("seller_record_shipment", {
        p_auction_id: auctionId,
        p_carrier: carrier,
        p_tracking_number: trackingNumber,
    });
}

/** Buyer confirms receipt — requires the shipment to be DELIVERED. */
export function confirmReceipt(auctionId) {
    return rpc("buyer_confirm_receipt", { p_auction_id: auctionId });
}

/** Buyer/seller opens a dispute during the confirmation window. */
export function openDispute(auctionId, reason, description = null) {
    return rpc("open_dispute", {
        p_auction_id: auctionId,
        p_reason: reason,
        p_description: description,
    });
}

/* ------------------------------------------------------------------ */
/* Service-role paths (via the app backend; 503 when not configured)   */
/* ------------------------------------------------------------------ */
export class BackendUnavailableError extends Error {
    constructor(detail) {
        super(detail || "SERVICE_ROLE_NOT_CONFIGURED");
        this.name = "BackendUnavailableError";
        this.detail = detail;
    }
}

async function backendCall(path, body, session) {
    if (!REACT_APP_BACKEND_URL) {
        throw new BackendUnavailableError("BACKEND_URL_NOT_CONFIGURED");
    }
    const token = session?.access_token;
    if (!token) throw new BackendUnavailableError("AUTH_REQUIRED");
    const res = await fetch(`${REACT_APP_BACKEND_URL}/api/${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        let parsed = detail;
        try {
            parsed = (JSON.parse(detail) || {}).detail || detail;
        } catch {
            /* keep raw text */
        }
        throw new BackendUnavailableError(parsed);
    }
    const json = await res.json();
    if (json && typeof json.result === "string") return json.result;
    return json;
}

/** Buyer stamps the escrow as FUNDED (payment secured mirror). */
export function markEscrowFunded(auctionId, session, transactionHash = null) {
    return backendCall(
        `auctions/${auctionId}/escrow/fund`,
        { transaction_hash: transactionHash },
        session
    );
}

/** Seller updates manual tracking status (DELIVERED starts the 48h window). */
export function updateTrackingStatus(auctionId, session, status) {
    return backendCall(`auctions/${auctionId}/shipping/tracking`, { status }, session);
}
