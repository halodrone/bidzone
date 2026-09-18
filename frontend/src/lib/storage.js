import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * BIDZONE Phase 6.1 — Supabase Storage helpers for auction media.
 *
 * Bucket: `auction-media` (PRIVATE — access via Storage RLS + signed URLs).
 * Path structure: `{auction_id}/{unique_filename}` (no wallet addresses,
 * no user-identifying data in paths).
 *
 * Signed-URL resolution happens INSIDE the data hooks (useLiveAuctions /
 * useAuction queryFn) via resolveMediaUrls() — components simply receive
 * rows whose media_url is already a playable signed URL.
 *
 * Limits (approved MVP):
 *   images: JPEG/PNG/WebP, max 10 MB each, max 5 per auction
 *   video:  MP4/WebM,     max 100 MB,      max 1 per auction
 */

export const MEDIA_BUCKET = "auction-media";
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 100;
export const MAX_IMAGES = 5;
export const MAX_VIDEOS = 1;
export const SIGN_TTL_SECONDS = 3600; // signed URLs live 1h

const ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
]);

/** Returns an error message string, or null when the file is acceptable. */
export function validateFile(file) {
    if (!file) return "No file selected";
    if (!ALLOWED_MIME.has(file.type)) {
        return "Unsupported file type — allowed: JPEG, PNG, WebP, MP4, WebM";
    }
    const isVideo = file.type.startsWith("video/");
    const limitMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (file.size > limitMb * 1024 * 1024) {
        return `File too large — max ${limitMb} MB for ${isVideo ? "videos" : "images"}`;
    }
    return null;
}

/**
 * Storage object path: `auction-media/{auction_id}/{unique_filename}`.
 * The original filename is sanitized (no PII, no wallet addresses) and
 * prefixed with a UUID so uploads never collide.
 */
export function buildObjectPath(auctionId, file) {
    const safeName =
        file.name
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(-60) || "media";
    const unique = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${auctionId}/${unique}-${safeName}`;
}

/**
 * Upload one file to the bucket with progress reporting.
 * Uses the Storage REST contract directly (POST /storage/v1/object/{bucket}/{path})
 * so we can surface real upload progress via XHR events. Authenticated seller
 * JWT is attached — Storage RLS (bidzone_media_insert_owner) enforces that the
 * auction folder belongs to the caller.
 *
 * Returns the stored object path (what we save in auction_items.media_url).
 */
export async function uploadAuctionMedia({ auctionId, file, onProgress }) {
    if (!supabase) throw new Error("Supabase is not configured");
    const path = buildObjectPath(auctionId, file);

    const { data: sessData } = await supabase.auth.getSession();
    const jwt = sessData?.session?.access_token;
    if (!jwt) throw new Error("Sign in required to upload media");

    const url = `${supabase.supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${path}`;

    await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("apikey", supabase.supabaseKey);
        xhr.setRequestHeader("authorization", `Bearer ${jwt}`);
        xhr.setRequestHeader("content-type", file.type);
        xhr.setRequestHeader("cacheControl", "31536000"); // 1y immutable object caching
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(parseStorageError(xhr)));
            }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
    });

    return path;
}

function parseStorageError(xhr) {
    try {
        const body = JSON.parse(xhr.responseText);
        return body.message || body.error || `Upload failed (${xhr.status})`;
    } catch {
        return `Upload failed (${xhr.status})`;
    }
}

/**
 * Remove objects (orphan cleanup / draft discard). Caller must own the
 * auction folder — Storage RLS (bidzone_media_delete_owner) enforces it
 * server-side too. Never throws when nothing was uploaded.
 */
export async function deleteAuctionMedia(paths) {
    if (!supabase || !paths || paths.length === 0) return;
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) throw error;
}

/**
 * Resolve auction_items rows (media_url = storage path) into rows whose
 * media_url is a time-limited signed URL. Pure helper — called inside the
 * data hooks' queryFn. On any failure we fall back to the original rows so
 * the existing graceful empty/error states keep working.
 */
export async function resolveMediaUrls(items) {
    if (!supabase || !items || items.length === 0) return items || [];
    const paths = items.map((i) => i && i.media_url).filter(Boolean).map((p) => p.replace(/^\/+/, ""));
    if (!paths.length) return items;
    try {
        const { data, error } = await supabase.storage
            .from(MEDIA_BUCKET)
            .createSignedUrls(paths, SIGN_TTL_SECONDS);
        if (error || !data) return items;
        const map = {};
        data.forEach((d) => {
            if (d && d.error) {
                console.warn("[bidzone:storage] sign failed for", d.path, ":", d.error);
            }
            if (d && d.path && d.signedUrl) map[d.path] = d.signedUrl;
        });
        return items.map((item) => {
            const key = item && item.media_url ? item.media_url.replace(/^\/+/, "") : null;
            const signed = key ? map[key] : null;
            if (key && !signed) {
                console.warn("[bidzone:storage] no signed url for", key);
            }
            return signed ? { ...item, media_url: signed } : item;
        });
    } catch (e) {
        console.warn("[bidzone:storage] media sign failed — falling back to raw paths", e && e.message);
        return items;
    }
}

/**
 * Minimal session reader (no auth UI in BIDZONE yet). Used by the Create
 * Auction page to gate uploads behind a real authenticated Supabase user.
 */
export function useSupabaseSession() {
    const q = useQuery({
        queryKey: ["supabase-session"],
        enabled: Boolean(supabase),
        queryFn: async () => {
            const { data } = await supabase.auth.getSession();
            return (data && data.session) || null;
        },
    });
    return {
        session: supabase ? q.data || null : null,
        isLoading: supabase ? q.isPending : false,
    };
}
