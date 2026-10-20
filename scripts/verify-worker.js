#!/usr/bin/env node
/**
 * scripts/verify-worker.js — runs the real Cloudflare Worker in Node.
 *
 * The Worker is a plain ES module whose only platform API is global `fetch`,
 * `Request` and `Response` — all present in Node 18+. So we can import it and
 * call worker.fetch(...) directly, stubbing DeepSeek's HTTP endpoint. That
 * gives real evidence for auth, rate limiting, payload validation, the JSON-mode
 * retry and every error mapping, without a Cloudflare account.
 *
 *   npm run test:worker
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

const ENV = {
  DEEPSEEK_API_KEY: 'sk-uji-tidak-nyata',
  APP_SHARED_KEY: 'kunci-aplikasi-uji-123456',
  DEEPSEEK_MODEL: 'deepseek-flash',
  ALLOWED_ORIGIN: '*',
  DAILY_TOKEN_BUDGET: '200000',
};

const VALID_BODY = {
  date: '20/10/2026',
  pekerja: [
    {
      nama: 'Ahmad bin Ali',
      jabatan: 'Operator',
      masuk: '08:12:00',
      keluar: '17:05:30',
      status: 'Baik',
    },
    {
      nama: 'Siti Nurhaliza',
      jabatan: 'Pengawas',
      masuk: '08:41:00',
      keluar: '',
      status: 'Lewat',
    },
  ],
  ringkasan: {hadir: 2, lewat: 1, sudah_keluar: 1},
};

let worker;
let deepseekCalls = [];

/** Stub for global.fetch: records the request and returns a scripted reply. */
function stubFetch(handler) {
  deepseekCalls = [];
  globalThis.fetch = async function (url, init) {
    const parsed = {
      url: url,
      headers: init && init.headers ? init.headers : {},
      body: init && init.body ? JSON.parse(init.body) : null,
    };
    deepseekCalls.push(parsed);
    return handler(parsed, deepseekCalls.length);
  };
}

function deepseekOk(content, model, usage) {
  return new Response(
    JSON.stringify({
      model: model || 'deepseek-flash',
      choices: [
        {message: {role: 'assistant', content: content}, finish_reason: 'stop'},
      ],
      usage: usage || {
        prompt_tokens: 300,
        completion_tokens: 120,
        total_tokens: 420,
      },
    }),
    {status: 200, headers: {'content-type': 'application/json'}},
  );
}

function deepseekError(status) {
  return new Response(JSON.stringify({error: {message: 'ralat ujian'}}), {
    status: status,
  });
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return '203.0.113.' + ipCounter;
}

function post(body, options) {
  const opts = options || {};
  const headers = {
    'content-type': 'application/json',
    'cf-connecting-ip': opts.ip || nextIp(),
  };
  if (opts.key !== null) {
    headers['x-app-key'] = opts.key || ENV.APP_SHARED_KEY;
  }
  return new Request('https://worker.uji/ringkasan', {
    method: 'POST',
    headers: headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function main() {
  worker = (await import('../server/deepseek-proxy/src/index.js')).default;
  const mod = await import('../server/deepseek-proxy/src/index.js');

  console.log('\n1) Routing and CORS');
  let res = await worker.fetch(new Request('https://worker.uji/'), ENV);
  let body = await res.json();
  eq('GET / -> 200', res.status, 200);
  eq('health body names the service', body.service, 'kehadiranpro-ai');
  check(
    'CORS header present',
    res.headers.get('access-control-allow-origin') === '*',
  );

  res = await worker.fetch(new Request('https://worker.uji/entah'), ENV);
  eq('unknown path -> 404', res.status, 404);
  eq('404 code', (await res.json()).code, 'TIDAK_DIJUMPAI');

  res = await worker.fetch(new Request('https://worker.uji/ringkasan'), ENV);
  eq('GET /ringkasan -> 405', res.status, 405);

  res = await worker.fetch(
    new Request('https://worker.uji/ringkasan', {method: 'OPTIONS'}),
    ENV,
  );
  eq('OPTIONS preflight -> 204', res.status, 204);

  console.log(
    '\n2) Auth and input validation (before a single token is spent)',
  );
  stubFetch(function () {
    return deepseekOk('{}');
  });

  res = await worker.fetch(post(VALID_BODY, {key: null}), ENV);
  eq('missing app key -> 401', res.status, 401);
  eq('401 code', (await res.json()).code, 'KUNCI_SALAH');
  eq('DeepSeek not called without a valid key', deepseekCalls.length, 0);

  res = await worker.fetch(post(VALID_BODY, {key: 'kunci-salah'}), ENV);
  eq('wrong app key -> 401', res.status, 401);

  res = await worker.fetch(post('{bukan json', {}), ENV);
  eq('broken JSON -> 400', res.status, 400);
  eq('400 code', (await res.json()).code, 'JSON_ROSAK');

  res = await worker.fetch(post({date: 'x'}, {}), ENV);
  eq('missing pekerja array -> 400', res.status, 400);
  eq('400 code', (await res.json()).code, 'DATA_TIDAK_SAH');

  res = await worker.fetch(post({pekerja: [], ringkasan: {}}, {}), ENV);
  eq('empty pekerja -> 400', res.status, 400);
  eq('400 code', (await res.json()).code, 'TIADA_REKOD');

  const tooMany = {
    pekerja: new Array(401).fill({nama: 'X', jabatan: 'Operator'}),
  };
  res = await worker.fetch(post(tooMany, {}), ENV);
  eq('401 workers -> 413', res.status, 413);
  eq('413 code', (await res.json()).code, 'TERLALU_BANYAK');

  const bigBody = JSON.stringify({pekerja: [{nama: 'X'.repeat(70000)}]});
  res = await worker.fetch(
    new Request('https://worker.uji/ringkasan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-key': ENV.APP_SHARED_KEY,
        'cf-connecting-ip': nextIp(),
        'content-length': String(bigBody.length),
      },
      body: bigBody,
    }),
    ENV,
  );
  eq('oversized body -> 413', res.status, 413);
  eq(
    'DeepSeek still not called after validation failures',
    deepseekCalls.length,
    0,
  );

  console.log('\n3) Successful summary');
  stubFetch(function () {
    return deepseekOk(
      JSON.stringify({
        ringkasan: 'Seramai 2 pekerja hadir. Seorang lewat daftar masuk.',
        amaran: ['Siti Nurhaliza belum mendaftar keluar.'],
        cadangan: 'Ingatkan Siti mendaftar keluar sebelum 18:00.',
      }),
    );
  });

  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), ENV);
  body = await res.json();
  eq('200 OK', res.status, 200);
  eq('ok flag', body.ok, true);
  check(
    'summary returned',
    /2 pekerja hadir/.test(body.ringkasan),
    body.ringkasan,
  );
  eq('one warning', body.amaran.length, 1);
  eq('suggestion returned', body.cadangan.indexOf('Siti') > -1, true);
  eq('model default applied', body.model, 'deepseek-flash');
  eq('token usage passed through', body.usage.total_tokens, 420);

  const sent = deepseekCalls[0];
  eq(
    'default DeepSeek endpoint used',
    sent.url,
    'https://api.deepseek.com/chat/completions',
  );
  eq('DeepSeek model id sent', sent.body.model, 'deepseek-flash');
  eq(
    'Authorization header',
    sent.headers.Authorization,
    'Bearer ' + ENV.DEEPSEEK_API_KEY,
  );
  eq('JSON mode requested', sent.body.response_format.type, 'json_object');
  eq('no streaming', sent.body.stream, false);
  check(
    'system prompt asks for Bahasa Malaysia',
    /Bahasa Malaysia/.test(sent.body.messages[0].content),
  );
  check(
    'user prompt contains the worker names',
    /Ahmad bin Ali/.test(sent.body.messages[1].content) &&
      /Siti Nurhaliza/.test(sent.body.messages[1].content),
  );
  check(
    'prompt marks the missing check-out',
    /belum/.test(sent.body.messages[1].content),
  );
  check(
    'no API key inside the prompt',
    sent.body.messages[1].content.indexOf('sk-') === -1,
  );

  console.log('\n3b) Local dev override (DEEPSEEK_BASE_URL)');
  stubFetch(function () {
    return deepseekOk(
      JSON.stringify({ringkasan: 'ok', amaran: [], cadangan: ''}),
    );
  });
  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), {
    ...ENV,
    DEEPSEEK_BASE_URL: 'http://localhost:8899/chat/completions',
  });
  eq(
    'endpoint override honoured (mock mode)',
    deepseekCalls[0].url,
    'http://localhost:8899/chat/completions',
  );
  eq('override request still succeeds', res.status, 200);

  console.log('\n4) JSON-mode retry when the model rejects response_format');
  stubFetch(function (call, attempt) {
    if (attempt === 1) {
      return deepseekError(400);
    }
    return deepseekOk(
      JSON.stringify({
        ringkasan: 'Ringkasan percubaan kedua.',
        amaran: [],
        cadangan: '',
      }),
    );
  });
  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), ENV);
  body = await res.json();
  eq('second attempt succeeds', res.status, 200);
  eq('two DeepSeek calls made', deepseekCalls.length, 2);
  eq(
    'first call used JSON mode',
    deepseekCalls[0].body.response_format.type,
    'json_object',
  );
  eq(
    'retry dropped response_format',
    deepseekCalls[1].body.response_format,
    undefined,
  );
  eq('json_mode reported false', body.json_mode, false);

  console.log('\n5) Upstream failures map to Malay messages, never to a crash');
  stubFetch(function () {
    return deepseekError(401);
  });
  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), ENV);
  body = await res.json();
  eq('DeepSeek 401 -> 502', res.status, 502);
  eq('502 code', body.code, 'DEEPSEEK_RALAT');
  check(
    'message blames the server key',
    /Kunci DeepSeek/i.test(body.message),
    body.message,
  );

  stubFetch(function () {
    return deepseekError(429);
  });
  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), ENV);
  body = await res.json();
  check(
    'DeepSeek 429 -> message says busy',
    /sibuk/i.test(body.message),
    body.message,
  );

  stubFetch(function () {
    const error = new Error('aborted');
    error.name = 'AbortError';
    return Promise.reject(error);
  });
  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), ENV);
  body = await res.json();
  eq('timeout -> 504', res.status, 504);
  eq('timeout code', body.code, 'MASA_TAMAT');

  console.log('\n6) Tolerating model output that is not clean JSON');
  eq(
    'fenced JSON parsed',
    mod.parseModelContent(
      '```json\n{"ringkasan":"a","amaran":[],"cadangan":""}\n```',
    ).ringkasan,
    'a',
  );
  eq(
    'prose before JSON tolerated',
    mod.parseModelContent(
      'Ini jawapan: {"ringkasan":"b","amaran":["x"],"cadangan":"y"} tamat',
    ).amaran.length,
    1,
  );
  eq('garbage returns null', mod.parseModelContent('tiada json di sini'), null);
  eq('empty returns null', mod.parseModelContent(''), null);

  stubFetch(function () {
    return deepseekOk('Pekerja hadir seperti biasa, tiada isu.');
  });
  res = await worker.fetch(post(VALID_BODY, {ip: nextIp()}), ENV);
  body = await res.json();
  eq('prose answer still 200', res.status, 200);
  eq(
    'prose answer flagged',
    body.perhatian,
    'Jawapan tidak dalam format piawai.',
  );
  eq('no fake warnings invented', body.amaran.length, 0);

  console.log('\n7) Rate limiting per IP');
  stubFetch(function () {
    return deepseekOk(
      JSON.stringify({ringkasan: 'ok', amaran: [], cadangan: ''}),
    );
  });
  const ip = '198.51.100.7';
  const statuses = [];
  for (let i = 0; i < 9; i += 1) {
    const r = await worker.fetch(post(VALID_BODY, {ip: ip}), ENV);
    statuses.push(r.status);
  }
  eq(
    'first 8 requests allowed',
    statuses.slice(0, 8).join(','),
    '200,200,200,200,200,200,200,200',
  );
  eq('9th request throttled', statuses[8], 429);
  eq('DeepSeek called only 8 times', deepseekCalls.length, 8);

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
