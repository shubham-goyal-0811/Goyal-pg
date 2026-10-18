const env = require('../config/env');

/**
 * Keep-alive ping — runs every 10 minutes while the server is up.
 *
 * Two free tiers go to sleep when nobody is using them:
 *   - Render stops the server after 15 minutes with no incoming requests. The
 *     next visitor waits ~15-50s for it to start, and the app's role lookup
 *     fails in the meantime, which reads as "No access" on the sign-in screen.
 *   - Supabase pauses the database after 7 days without queries.
 *
 * So this calls the server's own PUBLIC address — going out through Render's
 * front door is what counts as an incoming request — and hits /health/db,
 * which runs one tiny query, so the same ping keeps the database awake too.
 *
 * It can only keep a running server awake, never wake a sleeping one. The
 * GitHub Actions workflow in .github/workflows/keep-alive.yml is the backup
 * that does that.
 */
const PING_TIMEOUT_MS = 30_000;

const runKeepAlive = async () => {
  if (!env.KEEP_ALIVE_URL) return;
  try {
    const res = await fetch(`${env.KEEP_ALIVE_URL}/health/db`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    // Quiet when healthy: one line every 10 minutes would bury the real logs.
    if (!res.ok) console.warn(`[keepAlive] /health/db answered ${res.status}`);
  } catch (err) {
    console.warn('[keepAlive] ping failed:', err.message);
  }
};

module.exports = runKeepAlive;
