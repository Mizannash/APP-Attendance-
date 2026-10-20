#!/usr/bin/env node
/**
 * scripts/verify-ai.js — headless tests for src/utils/ai.js.
 *
 * Stubs global.fetch, so the real payload builder, timeout handling, status
 * mapping and text export all run exactly as they do on the device — no
 * network, no DeepSeek key, no React.
 *
 *   npm run test:ai
 */

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log('  ok   ' + label);
  } else {
    failures += 1;
    console.log('  FAIL ' + label + (detail ? '  -> ' + detail : ''));
  }
}

function eq(label, actual, expected) {
  check(
    label,
    actual === expected,
    'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected),
  );
}

const ai = require('../src/utils/ai');
const {isAiConfigured} = require('../src/config');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rec(name, jabatan, type, time, status) {
  return {
    id: name + type + time,
    name: name,
    jabatan: jabatan,
    type: type,
    time: time,
    status: status || 'Baik',
    date: '20/10/2026',
    dateKey: '2026-10-20',
    timestamp: '2026-10-20T' + time + '+08:00',
  };
}

const DAY = [
  rec('Ahmad bin Ali', 'Operator', 'masuk', '08:12:00', 'Baik'),
  rec('Ahmad bin Ali', 'Operator', 'keluar', '17:05:30', 'Baik'),
  rec('Siti Nurhaliza', 'Pengawas', 'masuk', '08:41:00', 'Lewat'),
  rec('Kumar', 'Teknikal', 'masuk', '07:55:00', 'Baik'),
  rec('  ahmad  bin ali ', 'Operator', 'masuk', '18:30:00', 'Lewat'),
  rec('Kumar', 'Teknikal', 'keluar', '12:00:00', 'Baik'),
];

function okResponse(body, status) {
  return Promise.resolve({
    ok: (status || 200) < 400,
    status: status || 200,
    json: function () {
      return Promise.resolve(body);
    },
    text: function () {
      return Promise.resolve(JSON.stringify(body));
    },
  });
}

async function main() {
  console.log('\n1) Payload building (what actually leaves the phone)');
  const payload = ai.buildPayload(DAY, '20/10/2026');
  eq('one row per worker', payload.pekerja.length, 3);
  eq('date label passed through', payload.date, '20/10/2026');
  const ahmad = payload.pekerja.filter(function (row) {
    return row.nama === 'Ahmad bin Ali';
  })[0];
  check('Ahmad grouped (case/space insensitive)', Boolean(ahmad));
  eq('earliest check-in kept', ahmad.masuk, '08:12:00');
  eq('latest check-out kept', ahmad.keluar, '17:05:30');
  const kumar = payload.pekerja.filter(function (row) {
    return row.nama === 'Kumar';
  })[0];
  eq('Kumar check-out kept', kumar.keluar, '12:00:00');
  const siti = payload.pekerja.filter(function (row) {
    return row.nama === 'Siti Nurhaliza';
  })[0];
  eq('late status preserved', siti.status, 'Lewat');
  eq('no check-out means empty string', siti.keluar, '');
  eq('hadir counts workers', payload.ringkasan.hadir, 3);
  eq('lewat counts late workers', payload.ringkasan.lewat, 1);
  eq('sudah_keluar counts check-outs', payload.ringkasan.sudah_keluar, 2);
  check(
    'payload has no timestamp/id/dateKey noise',
    JSON.stringify(payload).indexOf('timestamp') === -1 &&
      JSON.stringify(payload).indexOf('2026-10-20T') === -1,
  );

  console.log('\n2) Refusing to call the network for an empty day');
  let called = false;
  let r = await ai.janaRingkasan([], {
    url: 'https://contoh.test/ringkasan',
    key: 'kunci-ujian-yang-panjang',
    fetchImpl: function () {
      called = true;
    },
  });
  eq('empty day -> TIADA_REKOD', r.code, 'TIADA_REKOD');
  eq('fetch not called', called, false);

  console.log('\n3) Successful response');
  let seen = null;
  r = await ai.janaRingkasan(DAY, {
    url: 'https://contoh.test/ringkasan',
    key: 'kunci-ujian-yang-panjang',
    dayLabel: '20/10/2026',
    fetchImpl: function (url, options) {
      seen = {url: url, options: options};
      return okResponse({
        ok: true,
        ringkasan: 'Seramai 3 pekerja hadir hari ini.',
        amaran: ['Kumar belum mendaftar keluar.'],
        cadangan: 'Ingatkan Kumar mendaftar keluar sebelum 18:00.',
        model: 'deepseek-flash',
        usage: {total_tokens: 421},
        json_mode: true,
      });
    },
  });
  eq('result ok', r.ok, true);
  eq('ringkasan kept', r.ringkasan, 'Seramai 3 pekerja hadir hari ini.');
  eq('warnings kept', r.amaran.length, 1);
  eq('model reported', r.model, 'deepseek-flash');
  eq('usage reported', r.usage.total_tokens, 421);
  eq('POST used', seen.options.method, 'POST');
  eq(
    'app key sent in header',
    seen.options.headers['x-app-key'],
    'kunci-ujian-yang-panjang',
  );
  check(
    'body is JSON with pekerja array',
    JSON.parse(seen.options.body).pekerja.length === 3,
  );

  console.log('\n4) Error mapping (every branch gets a Malay message)');
  const cases = [
    [401, {ok: false, message: 'x'}, 'KUNCI_SALAH'],
    [429, {ok: false, message: 'Terlalu banyak permintaan.'}, 'TERLALU_KERAP'],
    [400, {ok: false, message: 'Data rekod tidak lengkap.'}, 'PELAYAN_RALAT'],
    [500, {ok: false, message: 'DeepSeek sibuk.'}, 'PELAYAN_RALAT'],
    [200, {ok: true}, 'RINGKASAN_KOSONG'],
    [200, null, 'JAWAPAN_ROSAK'],
  ];
  for (const [status, body, expected] of cases) {
    const result = await ai.janaRingkasan(DAY, {
      url: 'https://contoh.test/ringkasan',
      key: 'kunci-ujian-yang-panjang',
      fetchImpl: function () {
        return okResponse(body, status);
      },
    });
    eq('status ' + status + ' -> ' + expected, result.code, expected);
    check(
      'status ' + status + ' has a message',
      typeof result.message === 'string' && result.message.length > 5,
    );
  }

  console.log('\n5) Offline and slow-server paths never throw');
  r = await ai.janaRingkasan(DAY, {
    url: 'https://contoh.test/ringkasan',
    key: 'kunci-ujian-yang-panjang',
    fetchImpl: function () {
      return Promise.reject(new TypeError('Network request failed'));
    },
  });
  eq('offline -> TANPA_RANGKAIAN', r.code, 'TANPA_RANGKAIAN');
  check(
    'offline message mentions internet',
    /internet/i.test(r.message),
    r.message,
  );

  r = await ai.janaRingkasan(DAY, {
    url: 'https://contoh.test/ringkasan',
    key: 'kunci-ujian-yang-panjang',
    timeoutMs: 20,
    fetchImpl: function (url, options) {
      return new Promise(function (resolve, reject) {
        options.signal.addEventListener('abort', function () {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
  });
  eq('abort -> MASA_TAMAT', r.code, 'MASA_TAMAT');

  r = await ai.janaRingkasan(DAY, {
    url: 'https://contoh.test/ringkasan',
    key: 'kunci-ujian-yang-panjang',
    fetchImpl: function () {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.reject(new Error('bad json'));
        },
        text: function () {
          return Promise.resolve('');
        },
      });
    },
  });
  eq('unparseable body -> JAWAPAN_ROSAK', r.code, 'JAWAPAN_ROSAK');

  console.log('\n6) Text export for the share sheet');
  const text = ai.ringkasanToText(
    {
      ok: true,
      ringkasan: 'Seramai 3 pekerja hadir.',
      amaran: ['Kumar belum keluar.'],
      cadangan: 'Ingatkan Kumar.',
    },
    '20/10/2026',
  );
  check('includes date', text.indexOf('20/10/2026') > -1);
  check('includes summary', text.indexOf('Seramai 3 pekerja hadir.') > -1);
  check('numbers the warnings', text.indexOf('1. Kumar belum keluar.') > -1);
  check('includes suggestion', text.indexOf('Cadangan: Ingatkan Kumar.') > -1);
  eq('failed result exports nothing', ai.ringkasanToText({ok: false}, 'x'), '');

  console.log('\n7) Config guard');
  eq('placeholder config detected as not configured', isAiConfigured(), false);
  check(
    'config exports a URL',
    typeof require('../src/config').AI_PROXY_URL === 'string',
  );

  console.log(
    '\n' +
      (checks - failures) +
      '/' +
      checks +
      ' checks passed' +
      (failures ? '  — ' + failures + ' FAILED' : ''),
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then(function (code) {
    process.exit(code);
  })
  .catch(function (error) {
    console.error('\nHARNESS ERROR:', error);
    process.exit(2);
  });
