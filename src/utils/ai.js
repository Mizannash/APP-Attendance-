/**
 * ai.js — client for the KehadiranPro DeepSeek proxy.
 *
 * Rules this file follows:
 *  - No API key, no SDK: one HTTPS POST to our own Worker (see server/deepseek-proxy).
 *  - Payload is small and only contains what the model needs: name, department,
 *    first check-in, last check-out. Names are sent because the summary has to
 *    name people; the screen tells the user that before they tap.
 *  - Everything is a {ok:false, code, message} result, never a throw, so the
 *    screen can render a Malay message and the app cannot crash offline.
 *  - Timers and AbortController work on Hermes without polyfills (RN provides
 *    both), so no extra dependency is pulled into the bundle.
 */

const {AI_PROXY_URL, AI_APP_KEY} = require('../config');
const {dateKey, formatDate, nameKey, normalizeName} = require('./date');

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_WORKERS = 400;

/**
 * Collapse the day's check-in/check-out rows into one row per worker.
 * Output is what the Worker expects:
 *   { date, pekerja: [{nama, jabatan, masuk, keluar, status}], ringkasan: {...} }
 *
 * Pure function — exported so scripts/verify-ai.js can assert the shape without
 * touching the network.
 */
function buildPayload(records, dayLabel) {
  const order = [];
  const byWorker = {};

  (records || []).forEach(function (record) {
    const key = nameKey(record.name);
    if (!key) {
      return;
    }
    if (!byWorker[key]) {
      byWorker[key] = {
        nama: normalizeName(record.name),
        jabatan: record.jabatan || 'Operator',
        masuk: '',
        keluar: '',
        status: 'Baik',
      };
      order.push(key);
    }
    const entry = byWorker[key];
    if (record.type === 'masuk') {
      // Earliest check-in wins; the status of that row decides Lewat/Baik.
      if (!entry.masuk || record.time < entry.masuk) {
        entry.masuk = record.time;
        entry.status = record.status === 'Lewat' ? 'Lewat' : 'Baik';
      }
    } else if (record.type === 'keluar') {
      // Latest check-out wins (a worker may leave, return, leave again).
      if (!entry.keluar || record.time > entry.keluar) {
        entry.keluar = record.time;
      }
    }
  });

  const pekerja = order.slice(0, MAX_WORKERS).map(function (key) {
    return byWorker[key];
  });

  const lewat = pekerja.filter(function (row) {
    return row.status === 'Lewat';
  }).length;
  const sudahKeluar = pekerja.filter(function (row) {
    return row.keluar !== '';
  }).length;

  return {
    date: dayLabel || formatDate(new Date()),
    pekerja: pekerja,
    ringkasan: {
      hadir: pekerja.length,
      lewat: lewat,
      sudah_keluar: sudahKeluar,
    },
  };
}

function fail(code, message) {
  return {ok: false, code: code, message: message};
}

/**
 * janaRingkasan(records, options) -> Promise<{ok, ringkasan, amaran, cadangan}>
 *
 * options (all optional, used by tests):
 *   url, key, timeoutMs, fetchImpl, dayLabel
 */
async function janaRingkasan(records, options) {
  const opts = options || {};
  const rows = records || [];

  if (rows.length === 0) {
    return fail('TIADA_REKOD', 'Tiada rekod hari ini untuk diringkaskan.');
  }

  const url = opts.url || AI_PROXY_URL;
  const key = opts.key || AI_APP_KEY;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const doFetch =
    opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);

  if (!doFetch) {
    return fail(
      'TIDAK_DISOKONG',
      'Peranti ini tidak menyokong sambungan rangkaian.',
    );
  }

  const payload = buildPayload(rows, opts.dayLabel);

  // AbortController is available in Hermes/RN; guard anyway so a weird runtime
  // degrades to "no timeout" instead of throwing at startup.
  let controller = null;
  let timer = null;
  if (typeof AbortController === 'function') {
    controller = new AbortController();
    timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
  }

  let response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key': key,
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (timer) {
      clearTimeout(timer);
    }
    const aborted = error && (error.name === 'AbortError' || error.code === 20);
    return fail(
      aborted ? 'MASA_TAMAT' : 'TANPA_RANGKAIAN',
      aborted
        ? 'Pelayan mengambil masa terlalu lama. Cuba lagi.'
        : 'Tiada sambungan internet. Ringkasan AI memerlukan data mudah alih atau Wi-Fi.',
    );
  }

  if (timer) {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    body = null;
  }

  if (response.status === 401) {
    return fail(
      'KUNCI_SALAH',
      'Kunci aplikasi tidak sah. Hubungi pentadbir sistem.',
    );
  }
  if (response.status === 429) {
    return fail(
      'TERLALU_KERAP',
      (body && body.message) ||
        'Terlalu banyak permintaan. Cuba lagi sebentar.',
    );
  }
  if (!response.ok) {
    return fail(
      'PELAYAN_RALAT',
      (body && body.message) ||
        'Pelayan AI memulangkan ralat (' + response.status + ').',
    );
  }
  if (!body || body.ok !== true) {
    return fail(
      'JAWAPAN_ROSAK',
      (body && body.message) || 'Jawapan pelayan tidak dapat dibaca.',
    );
  }
  if (!body.ringkasan) {
    return fail(
      'RINGKASAN_KOSONG',
      'Pelayan tidak memulangkan ringkasan. Cuba lagi.',
    );
  }

  return {
    ok: true,
    ringkasan: body.ringkasan,
    amaran: Array.isArray(body.amaran) ? body.amaran : [],
    cadangan: body.cadangan || '',
    model: body.model || 'deepseek',
    usage: body.usage || null,
    jsonMode: body.json_mode !== false,
  };
}

/** Plain-text version for the share sheet / WhatsApp. */
function ringkasanToText(result, dayLabel) {
  if (!result || !result.ok) {
    return '';
  }
  const lines = [
    'Ringkasan Kehadiran — ' + (dayLabel || formatDate(new Date())),
    '',
  ];
  lines.push(result.ringkasan);
  if (result.amaran && result.amaran.length) {
    lines.push('', 'Perlu perhatian:');
    result.amaran.forEach(function (item, index) {
      lines.push(index + 1 + '. ' + item);
    });
  }
  if (result.cadangan) {
    lines.push('', 'Cadangan: ' + result.cadangan);
  }
  lines.push('', 'Dijana oleh DeepSeek melalui KehadiranPro');
  return lines.join('\n');
}

/** Today's key, re-exported so the screen and the storage layer agree. */
function todayKey() {
  return dateKey(new Date());
}

module.exports = {
  buildPayload,
  janaRingkasan,
  ringkasanToText,
  todayKey,
  MAX_WORKERS,
};
