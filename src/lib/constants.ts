/**
 * Default port for the FACE dashboard.
 *
 * Used by the dev server, hook installation, and any code that generates
 * URLs pointing back to the dashboard. The `face` CLI launcher and
 * `install.sh` also default to this value (via the PORT env var).
 */
export const FACE_PORT = 3456;

/** Base URL for the FACE dashboard (no trailing slash). */
export const FACE_BASE_URL = `http://localhost:${FACE_PORT}`;
