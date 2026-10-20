/**
 * config.js — deployment-specific endpoints.
 *
 * The DeepSeek key is NOT here and must never be here: it lives in the
 * Cloudflare Worker's secret store. The app only knows the Worker URL and the
 * shared "app key", which is a speed bump against casual abuse (it can be
 * extracted from an APK — the Worker's rate limit and token budget are the real
 * protection).
 *
 * After `wrangler deploy`, copy the printed URL and the APP_SHARED_KEY here,
 * then rebuild. If either still contains a placeholder the Ringkasan AI screen
 * shows a setup hint instead of calling out.
 *
 * LOCAL DEVELOPMENT (no Cloudflare account needed):
 *   cd server/deepseek-proxy && node dev-server.js     # port 8787
 *   then use one of:
 *     emulator        http://10.0.2.2:8787/ringkasan
 *     phone (LAN)     http://<IP-komputer-anda>:8787/ringkasan
 *     computer curl   http://localhost:8787/ringkasan
 *   Cleartext for those hosts is already allowed by
 *   android/app/src/main/res/xml/network_security_config.xml.
 */

const AI_PROXY_URL =
  'https://kehadiranpro-ai.YOUR-SUBDOMAIN.workers.dev/ringkasan';
// Local example (uncomment and comment the line above):
// const AI_PROXY_URL = 'http://10.0.2.2:8787/ringkasan';

const AI_APP_KEY = 'GANTI-DENGAN-KUNCI-ANDA';

function isAiConfigured() {
  return (
    AI_PROXY_URL.indexOf('YOUR-SUBDOMAIN') === -1 &&
    AI_APP_KEY.indexOf('GANTI-') === -1 &&
    AI_APP_KEY.length >= 16
  );
}

module.exports = {
  AI_PROXY_URL,
  AI_APP_KEY,
  isAiConfigured,
};
