/**
 * BIDZONE — backend base URL for the FastAPI service-role routes.
 * Env-driven only (never hardcoded): falls back to "" and callers surface
 * an honest error.
 */
export const REACT_APP_BACKEND_URL =
    (typeof process !== "undefined" && process.env.REACT_APP_BACKEND_URL) || "";
