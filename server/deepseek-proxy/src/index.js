/**
 * KehadiranPro AI proxy — Cloudflare Worker (module format, no npm deps).
 *
 * WHY A PROXY AT ALL
 * A DeepSeek API key inside an APK is a key that anyone can extract with
 * `unzip` + `strings`, and DeepSeek bills per token. So the phone never sees a
 * DeepSeek key: it calls this Worker, and the Worker holds the key in a
 * Cloudflare secret and forwards one narrowly-shaped request.
 *
 * ENDPOINT
 *   POST /ringkasan      { date, pekerja[], ringkasan } -> { ok, ringkasan, amaran[], cadangan }
 *   GET  /               health + version (no key needed)
 *
 * SECRETS (wrangler secret put ...)
 *   DEEPSEEK_API_KEY     sk-...            (platform.deepseek.com)
 *   APP_SHARED_KEY       long random string the app sends in x-app-key
 *
 * VARS (wrangler.toml)
 *   DEEPSEEK_MODEL       default "deepseek-flash"
 *   ALLOWED_ORIGIN       CORS origin, default "*"
 *   DAILY_TOKEN_BUDGET   soft cap per isolate-day, default 200000
 *
 * The shared key is NOT a secret in the strong sense — it ships inside the app
 * and can be extracted. It only stops casual abuse; the real limits are the
 * per-IP rate limit, the payload caps and the token budget below.
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-flash';

const MAX_RECORDS = 400; // a 200-worker site = 400 check-in/out rows
const MAX_BODY_BYTES = 64 * 1024;
const MAX_NAME_LEN = 60;
const REQUEST_TIMEOUT_MS = 25000;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 8; // per IP per minute

// Module scope survives between requests inside one isolate (best effort —
// Cloudflare may run several isolates, so this is abuse friction, not a quota).
const rateHits = new Map();
let budgetUsed = 0;
let budgetDay = '';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOWED_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-app-key',
    'Access-Control-Max-Age': '86400',
  };
}

function send(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign(
      {'content-type': 'application/json; charset=utf-8'},
      corsHeaders(env),
    ),
  });
}

function fail(code, message, status, env) {
  return send({ok: false, code: code, message: message}, status, env);
}

function todayKey(now) {
  const d = now || new Date();
  return (
    d.getUTCFullYear() +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

/** Returns true when this IP has spent its allowance for the current minute. */
function isRateLimited(ip, nowMs) {
  const now = nowMs || Date.now();
  const entry = rateHits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateHits.set(ip, {start: now, count: 1});
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

function cleanText(value, maxLen) {
  return (
    String(value == null ? '' : value)
      // Strip control characters before they reach the prompt (prompt-injection
      // hygiene: a worker name containing newlines could reshape the payload).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen || MAX_NAME_LEN)
  );
}

function normalisePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  if (!Array.isArray(raw.pekerja)) {
    return null;
  }
  if (raw.pekerja.length > MAX_RECORDS) {
    return {
      error: 'TERLALU_BANYAK',
      message: 'Terlalu banyak rekod untuk satu permintaan.',
    };
  }
  const pekerja = raw.pekerja
    .filter(function (row) {
      return row && typeof row === 'object' && cleanText(row.nama).length > 0;
    })
    .map(function (row) {
      return {
        nama: cleanText(row.nama),
        jabatan: cleanText(row.jabatan, 24),
        masuk: cleanText(row.masuk, 8),
        keluar: cleanText(row.keluar, 8),
        status: cleanText(row.status, 8) === 'Lewat' ? 'Lewat' : 'Baik',
      };
    });
  const stats =
    raw.ringkasan && typeof raw.ringkasan === 'object' ? raw.ringkasan : {};
  return {
    date: cleanText(raw.date, 10) || '-',
    pekerja: pekerja,
    ringkasan: {
      hadir: Number(stats.hadir) || 0,
      lewat: Number(stats.lewat) || 0,
      sudah_keluar: Number(stats.sudah_keluar) || 0,
    },
  };
}

/** Build the chat messages. Exported for the Node test harness. */
export function buildMessages(payload) {
  const lines = payload.pekerja.map(function (row) {
    return (
      '- ' +
      row.nama +
      ' (' +
      row.jabatan +
      '): masuk ' +
      (row.masuk || '-') +
      ' [' +
      row.status +
      '], keluar ' +
      (row.keluar || 'belum')
    );
  });

  const userBody = [
    'Tarikh: ' + payload.date,
    'Hadir: ' + payload.ringkasan.hadir,
    'Lewat: ' + payload.ringkasan.lewat,
    'Sudah keluar: ' + payload.ringkasan.sudah_keluar,
    '',
    'Rekod pekerja:',
    lines.length ? lines.join('\n') : '(tiada rekod)',
  ].join('\n');

  return [
    {
      role: 'system',
      content:
        'Anda pembantu pentadbir HR di tapak kerja di Malaysia. Beri ringkasan ' +
        'kehadiran harian dalam Bahasa Malaysia yang formal dan ringkas.\n' +
        'Peraturan:\n' +
        '- Jangan reka nama, masa atau pekerja yang tiada dalam data.\n' +
        '- "Lewat" bermakna daftar masuk selepas 08:30.\n' +
        '- "Belum keluar" bermakna ada rekod masuk tanpa rekod keluar.\n' +
        '- Jika data tidak lengkap, nyatakan dengan jujur.\n' +
        'Pulangkan HANYA JSON dengan bentuk ini: ' +
        '{"ringkasan": string (2-4 ayat), "amaran": string[] (0-5 item, satu ayat setiap satu), "cadangan": string (1 ayat)}',
    },
    {role: 'user', content: userBody},
  ];
}

async function callDeepSeek(env, messages, useJsonMode) {
  // DEEPSEEK_BASE_URL lets the local dev server point at a mock endpoint so the
  // whole path can be exercised offline, without spending a token.
  const endpoint = env.DEEPSEEK_BASE_URL || DEEPSEEK_URL;
  const body = {
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    messages: messages,
    temperature: 0.2,
    max_tokens: 700,
    stream: false,
  };
  if (useJsonMode) {
    body.response_format = {type: 'json_object'};
  }

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the JSON answer out of the model's text, tolerating ```json fences. */
export function parseModelContent(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // Last resort: grab the outermost {...} block.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const amaran = Array.isArray(parsed.amaran)
    ? parsed.amaran
        .filter(function (item) {
          return typeof item === 'string' && item.trim().length > 0;
        })
        .slice(0, 5)
    : [];
  return {
    ringkasan:
      typeof parsed.ringkasan === 'string' ? parsed.ringkasan.trim() : '',
    amaran: amaran,
    cadangan: typeof parsed.cadangan === 'string' ? parsed.cadangan.trim() : '',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: corsHeaders(env)});
    }

    if (url.pathname !== '/ringkasan') {
      if (url.pathname === '/' && request.method === 'GET') {
        return send(
          {
            ok: true,
            service: 'kehadiranpro-ai',
            model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
            endpoints: ['POST /ringkasan'],
          },
          200,
          env,
        );
      }
      return fail('TIDAK_DIJUMPAI', 'Laluan tidak dijumpai.', 404, env);
    }

    if (request.method !== 'POST') {
      return fail('KAEDAH_SALAH', 'Guna POST untuk laluan ini.', 405, env);
    }

    // --- auth (friction only, see header comment) -------------------------
    const appKey = request.headers.get('x-app-key') || '';
    if (!env.APP_SHARED_KEY || appKey !== env.APP_SHARED_KEY) {
      return fail('KUNCI_SALAH', 'Kunci aplikasi tidak sah.', 401, env);
    }

    const ip = request.headers.get('cf-connecting-ip') || 'tanpa-ip';
    const nowMs = Date.now();
    if (isRateLimited(ip, nowMs)) {
      return fail(
        'TERLALU_KERAP',
        'Terlalu banyak permintaan. Cuba lagi dalam satu minit.',
        429,
        env,
      );
    }

    // --- guard rails ------------------------------------------------------
    if (!env.DEEPSEEK_API_KEY) {
      return fail(
        'PELAYAN_TIDAK_SIAP',
        'Kunci DeepSeek belum ditetapkan pada pelayan.',
        500,
        env,
      );
    }

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) {
      return fail('TERLALU_BESAR', 'Permintaan terlalu besar.', 413, env);
    }

    let raw;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return fail('TERLALU_BESAR', 'Permintaan terlalu besar.', 413, env);
      }
      raw = JSON.parse(text);
    } catch (error) {
      return fail('JSON_ROSAK', 'Format permintaan tidak sah.', 400, env);
    }

    const payload = normalisePayload(raw);
    if (!payload) {
      return fail('DATA_TIDAK_SAH', 'Data rekod tidak lengkap.', 400, env);
    }
    if (payload.error) {
      return fail(payload.error, payload.message, 413, env);
    }
    if (payload.pekerja.length === 0) {
      return fail('TIADA_REKOD', 'Tiada rekod untuk diringkaskan.', 400, env);
    }

    const day = todayKey();
    if (budgetDay !== day) {
      budgetDay = day;
      budgetUsed = 0;
    }
    const budget = Number(env.DAILY_TOKEN_BUDGET || 200000);
    if (budgetUsed > budget) {
      return fail(
        'BAJET_HABIS',
        'Had penggunaan harian dicapai. Cuba esok.',
        429,
        env,
      );
    }

    // --- call DeepSeek ----------------------------------------------------
    const messages = buildMessages(payload);
    let response;
    let jsonMode = true;
    try {
      response = await callDeepSeek(env, messages, true);
      if (response.status === 400) {
        // Some deployments reject response_format for a given model. Retry
        // once in plain mode rather than failing the user's request.
        jsonMode = false;
        response = await callDeepSeek(env, messages, false);
      }
    } catch (error) {
      const aborted = error && error.name === 'AbortError';
      return fail(
        aborted ? 'MASA_TAMAT' : 'PELAYAN_GAGAL',
        aborted
          ? 'DeepSeek mengambil masa terlalu lama. Cuba lagi.'
          : 'Tidak dapat menghubungi DeepSeek. Cuba lagi.',
        504,
        env,
      );
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch (error) {
        detail = '';
      }
      const status = response.status;
      const message =
        status === 401
          ? 'Kunci DeepSeek tidak sah pada pelayan.'
          : status === 402
          ? 'Kredit DeepSeek tidak mencukupi.'
          : status === 429
          ? 'DeepSeek sibuk. Cuba lagi sebentar.'
          : 'DeepSeek memulangkan ralat (' + status + ').';
      return send(
        {ok: false, code: 'DEEPSEEK_RALAT', message: message, detail: detail},
        502,
        env,
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      return fail(
        'JAWAPAN_ROSAK',
        'Jawapan DeepSeek tidak dapat dibaca.',
        502,
        env,
      );
    }

    const choice = data && data.choices && data.choices[0];
    const content = choice && choice.message ? choice.message.content : '';
    const parsed = parseModelContent(content);

    if (data && data.usage) {
      budgetUsed +=
        (Number(data.usage.prompt_tokens) || 0) +
        (Number(data.usage.completion_tokens) || 0);
    }

    if (!parsed || !parsed.ringkasan) {
      // Never fail the screen just because the model wrapped its prose.
      return send(
        {
          ok: true,
          ringkasan: String(content || '').slice(0, 1200),
          amaran: [],
          cadangan: '',
          model: (data && data.model) || env.DEEPSEEK_MODEL || DEFAULT_MODEL,
          json_mode: jsonMode,
          perhatian: 'Jawapan tidak dalam format piawai.',
        },
        200,
        env,
      );
    }

    return send(
      {
        ok: true,
        ringkasan: parsed.ringkasan,
        amaran: parsed.amaran,
        cadangan: parsed.cadangan,
        model: (data && data.model) || env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        json_mode: jsonMode,
        usage: data && data.usage ? data.usage : null,
      },
      200,
      env,
    );
  },
};
