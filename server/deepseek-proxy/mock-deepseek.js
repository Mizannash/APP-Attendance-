/**
 * mock-deepseek.js — fake DeepSeek endpoint for offline testing.
 *
 * Returns the same shape as POST /chat/completions so the proxy can be exercised
 * end to end (prompt building → JSON parsing → Malay summary) without a key and
 * without spending tokens.
 *
 *   node mock-deepseek.js                 # listens on 8899
 *   # then, in .dev.vars:
 *   DEEPSEEK_BASE_URL=http://localhost:8899/chat/completions
 *
 * It answers with a summary derived from the prompt it receives, so you can see
 * that the real payload actually reached the "model".
 */

import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8899);

const server = http.createServer(async function (req, res) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    payload = null;
  }

  if (!payload || !Array.isArray(payload.messages)) {
    res.writeHead(400, {'content-type': 'application/json'});
    res.end(JSON.stringify({error: {message: 'messages required'}}));
    return;
  }

  const userPrompt = String(payload.messages[1] && payload.messages[1].content);
  const names = userPrompt
    .split('\n')
    .filter(function (line) {
      return line.startsWith('- ');
    })
    .map(function (line) {
      return line.slice(2).split(' (')[0];
    });
  const belumKeluar = userPrompt
    .split('\n')
    .filter(function (line) {
      return line.indexOf('keluar belum') !== -1;
    })
    .map(function (line) {
      return line.slice(2).split(' (')[0];
    });

  const answer = {
    ringkasan:
      '(MOCK) Seramai ' +
      names.length +
      ' pekerja direkodkan: ' +
      names.join(', ') +
      '. Data diterima daripada app dan dihantar melalui proxy.',
    amaran: belumKeluar.map(function (name) {
      return name + ' belum mendaftar keluar.';
    }),
    cadangan:
      belumKeluar.length > 0
        ? 'Ingatkan pekerja yang belum keluar sebelum waktu tamat.'
        : 'Kehadiran hari ini lengkap.',
  };

  console.log(
    '[mock] model=' +
      payload.model +
      ' json_mode=' +
      Boolean(payload.response_format) +
      ' pekerja=' +
      names.length,
  );

  res.writeHead(200, {'content-type': 'application/json'});
  res.end(
    JSON.stringify({
      id: 'mock-1',
      model: 'mock-deepseek',
      choices: [
        {
          index: 0,
          message: {role: 'assistant', content: JSON.stringify(answer)},
          finish_reason: 'stop',
        },
      ],
      usage: {prompt_tokens: 420, completion_tokens: 130, total_tokens: 550},
    }),
  );
});

server.listen(PORT, '127.0.0.1', function () {
  console.log(
    'Mock DeepSeek listening on http://localhost:' + PORT + '/chat/completions',
  );
});
