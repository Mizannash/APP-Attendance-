/**
 * dev-server.js — run the KehadiranPro AI proxy on localhost.
 *
 * The Worker module is platform-agnostic (it only needs fetch/Request/Response),
 * so this file wraps it in a plain Node HTTP server. Identical code path to
 * production: routing, x-app-key auth, validation caps, rate limiting, DeepSeek
 * prompt and JSON parsing all run for real.
 *
 *   cd server/deepseek-proxy
 *   cp .dev.vars.example .dev.vars      # fill in DEEPSEEK_API_KEY + APP_SHARED_KEY
 *   node dev-server.js                  # http://localhost:8787
 *
 * Useful for testing the app before deploying:
 *   Android emulator  -> http://10.0.2.2:8787/ringkasan
 *   Physical phone    -> http://<IP-komputer-anda>:8787/ringkasan  (same Wi-Fi)
 *
 * Set DEEPSEEK_BASE_URL in .dev.vars to point at a mock (see mock-deepseek.js)
 * if you want to test without spending tokens.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import worker from './src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  const file = path.join(here, '.dev.vars');
  if (!fs.existsSync(file)) {
    return {};
  }
  const out = {};
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        return;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    });
  return out;
}

const devVars = loadDevVars();
const env = Object.assign(
  {
    DEEPSEEK_MODEL: 'deepseek-flash',
    ALLOWED_ORIGIN: '*',
    DAILY_TOKEN_BUDGET: '200000',
  },
  devVars,
  process.env,
);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const missing = ['DEEPSEEK_API_KEY', 'APP_SHARED_KEY'].filter(function (key) {
  return !env[key];
});

const server = http.createServer(async function (req, res) {
  try {
    const host = req.headers.host || 'localhost:' + PORT;
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = Object.assign({}, req.headers, {
      // Same header Cloudflare would set, so the Worker's per-IP rate limit
      // behaves the same locally instead of lumping everyone under "tanpa-ip".
      'cf-connecting-ip': req.socket.remoteAddress || '127.0.0.1',
    });

    const request = new Request('http://' + host + req.url, {
      method: req.method,
      headers: headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    const response = await worker.fetch(request, env);
    const out = Buffer.from(await response.arrayBuffer());
    const outHeaders = {};
    response.headers.forEach(function (value, key) {
      outHeaders[key] = value;
    });

    res.writeHead(response.status, outHeaders);
    res.end(response.status === 204 ? undefined : out);
  } catch (error) {
    console.error('[dev-server] ralat:', error);
    res.writeHead(500, {'content-type': 'application/json; charset=utf-8'});
    res.end(
      JSON.stringify({
        ok: false,
        code: 'PELAYAN_GAGAL',
        message: 'Ralat pelayan tempatan.',
      }),
    );
  }
});

server.listen(PORT, HOST, function () {
  console.log('KehadiranPro AI proxy (local)');
  console.log('  http://localhost:' + PORT + '/');
  console.log('  http://localhost:' + PORT + '/ringkasan   (POST)');
  console.log('  model: ' + env.DEEPSEEK_MODEL);
  console.log(
    '  upstream: ' +
      (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions'),
  );
  if (missing.length) {
    console.log('');
    console.log('  PERHATIAN: ' + missing.join(', ') + ' belum ditetapkan.');
    console.log('  Salin .dev.vars.example -> .dev.vars dan isi nilainya.');
    console.log('  Tanpa APP_SHARED_KEY, setiap permintaan akan dapat 401.');
  }
  console.log('');
  console.log('Uji:');
  console.log(
    '  curl -s http://localhost:' + PORT + '/ -H "x-app-key: $APP_SHARED_KEY"',
  );
});
