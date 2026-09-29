/**
 * Small utility helpers used across Auction Room components.
 * Pure functions, no side effects.
 */

/** 0xABCD…1234 style address abbreviation. */
export function shortAddr(addr) {
    if (!addr || typeof addr !== "string") return "—";
    const a = addr.trim();
    if (a.length < 12) return a;
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Format a Numeric(38,18) string as a compact display value. */
export function fmtAmount(n) {
    if (n === null || n === undefined || n === "") return "—";
    const s = String(n);
    if (!s.includes(".")) return s;
    return s.replace(/0+$/, "").replace(/\.$/, "");
}

/** Best-effort display name for a user record joined from `profiles`. */
export function displayName(user) {
    if (!user) return "Anonymous";
    return (
        user.display_name ||
        user.username ||
        shortAddr(user.wallet_address) ||
        "Anonymous"
    );
}

/**
 * Username-first identity resolver for public/private UI surfaces.
 * Mirrors AuctionCard's sellerUsername logic so seller identity, comment
 * author identity, etc. are consistent across the app.
 *
 * Priority:
 *   1. profiles.username           (user-chosen handle)
 *   2. profiles.display_name       (Google display name, if set)
 *   3. Own email local-part        (only if viewer IS this profile)
 *   4. "User"                      (never wallet address, never @, never full email)
 *
 * NEVER falls back to wallet address, "Anonymous", or the raw email.
 */
export function usernameFor(user, viewer) {
    const u = Array.isArray(user) ? user[0] || {} : user || {};
    const viewerIsSelf = viewer && u && u.id && viewer.id && u.id === viewer.id;
    const source =
        u.username ||
        u.display_name ||
        u.email ||
        (viewerIsSelf ? viewer.email : "") ||
        "";
    const cleaned = String(source || "").split("@")[0].trim();
    return cleaned || "User";
}

/** Relative time — "just now", "2m ago", "3h ago", "yesterday", or a date. */
export function timeAgo(iso) {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}
