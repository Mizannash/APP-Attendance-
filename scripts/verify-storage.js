#!/usr/bin/env node
/**
 * scripts/verify-storage.js — headless proof that the data layer works.
 *
 * The business rules of this app (late flag, duplicate check-in, orphan
 * check-out, corrupt-data recovery, CSV shape) live in src/utils/storage.js
 * with no React imports, so they can be executed in plain Node. This script
 * injects in-memory stand-ins for AsyncStorage and react-native-fs and
 * exercises the real module — no Jest, no native build, no emulator.
 *
 *   npm test          (runs this file)
 */

const Module = require('module');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const store = new Map();

const asyncStorageStub = {
  __esModule: true,
  default: {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => {
      store.set(key, String(value));
    },
    removeItem: async key => {
      store.delete(key);
    },
    clear: async () => store.clear(),
    getAllKeys: async () => Array.from(store.keys()),
  },
};

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kehadiran-'));
const documents = path.join(tmpRoot, 'documents');
const downloads = path.join(tmpRoot, 'downloads');
fs.mkdirSync(documents, {recursive: true});
fs.mkdirSync(downloads, {recursive: true});

let blockDownloads = false; // flip on to test the app-documents fallback
const written = [];

const rnfsStub = {
  DocumentDirectoryPath: documents,
  DownloadDirectoryPath: downloads,
  writeFile: async (filePath, contents, encoding) => {
    if (blockDownloads && filePath.indexOf(downloads) === 0) {
      throw new Error('EACCES: scoped storage denied');
    }
    fs.writeFileSync(filePath, contents, encoding || 'utf8');
    written.push(filePath);
    return true;
  },
  exists: async filePath => fs.existsSync(filePath),
  unlink: async filePath => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') {
    return asyncStorageStub;
  }
  if (request === 'react-native-fs') {
    return rnfsStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const storage = require('../src/utils/storage');
const dates = require('../src/utils/date');

// Fixed local dates so the test does not depend on the machine clock/timezone.
const DAY = '2026-10-20';
const at = (h, m, s) => new Date(2026, 9, 20, h, m, s || 0);

async function reset() {
  store.clear();
  written.length = 0;
  blockDownloads = false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n1) Rejecting empty / whitespace input (no crash, no record)');
  await reset();
  let r = await storage.registerAttendance({
    name: '',
    jabatan: 'Operator',
    type: 'masuk',
  });
  eq('empty name -> NAMA_KOSONG', r.code, 'NAMA_KOSONG');
  r = await storage.registerAttendance({
    name: '   ',
    jabatan: 'Operator',
    type: 'masuk',
  });
  eq('whitespace name -> NAMA_KOSONG', r.code, 'NAMA_KOSONG');
  r = await storage.registerAttendance({
    name: 'A',
    jabatan: 'Operator',
    type: 'masuk',
  });
  eq('1-char name -> NAMA_KOSONG', r.code, 'NAMA_KOSONG');
  eq('nothing written to storage', store.size, 0);

  console.log('\n2) Check-in, late flag, and duplicate blocking');
  await reset();
  r = await storage.registerAttendance({
    name: '  Ahmad   bin Ali ',
    jabatan: 'Operator',
    type: 'masuk',
    now: at(8, 12, 0),
  });
  check('08:12 check-in accepted', r.ok === true);
  eq('name normalised', r.record.name, 'Ahmad bin Ali');
  eq('status on time', r.record.status, 'Baik');
  eq('time format HH:mm:ss', r.record.time, '08:12:00');
  eq('date format DD/MM/YYYY', r.record.date, '20/10/2026');
  eq(
    'storage key is per-date',
    Array.from(store.keys())[0],
    'kehadiran_2026-10-20',
  );

  r = await storage.registerAttendance({
    name: 'AHMAD BIN ALI',
    jabatan: 'Teknikal',
    type: 'masuk',
    now: at(8, 20, 0),
  });
  eq('duplicate check-in blocked', r.code, 'SUDAH_MASUK');
  check(
    'duplicate message names the open check-in',
    /08:12:00/.test(r.message),
    r.message,
  );
  eq(
    'still exactly one record',
    (await storage.getRecordsByDate(DAY)).length,
    1,
  );

  r = await storage.registerAttendance({
    name: 'Siti',
    jabatan: 'Pengawas',
    type: 'masuk',
    now: at(8, 31, 0),
  });
  eq('08:31 -> Lewat', r.record.status, 'Lewat');
  r = await storage.registerAttendance({
    name: 'Kumar',
    jabatan: 'Teknikal',
    type: 'masuk',
    now: at(8, 30, 0),
  });
  eq('08:30:00 exactly -> Baik', r.record.status, 'Baik');
  r = await storage.registerAttendance({
    name: 'Mei Ling',
    jabatan: 'Operator',
    type: 'masuk',
    now: at(8, 30, 1),
  });
  eq('08:30:01 -> Lewat', r.record.status, 'Lewat');

  console.log('\n3) Check-out rules');
  r = await storage.registerAttendance({
    name: 'Belum Masuk',
    jabatan: 'Operator',
    type: 'keluar',
    now: at(17, 0, 0),
  });
  eq('check-out without check-in blocked', r.code, 'BELUM_MASUK');

  r = await storage.registerAttendance({
    name: 'Ahmad bin Ali',
    jabatan: 'Operator',
    type: 'keluar',
    now: at(17, 5, 30),
  });
  check('check-out accepted', r.ok === true);
  eq('check-out status is Baik', r.record.status, 'Baik');
  eq('check-out time', r.record.time, '17:05:30');

  const state = await storage.getWorkerState('Ahmad bin Ali', DAY);
  eq('no open check-in after check-out', state.openRecord, null);

  r = await storage.registerAttendance({
    name: 'Ahmad bin Ali',
    jabatan: 'Operator',
    type: 'masuk',
    now: at(17, 6, 0),
  });
  check('re-check-in allowed after check-out', r.ok === true);
  check('re-check-in after 08:30 flagged Lewat', r.record.status === 'Lewat');

  console.log('\n4) Corrupt / hostile data never crashes a read');
  await reset();
  store.set('kehadiran_' + DAY, '{not json');
  eq('invalid JSON -> []', (await storage.getRecordsByDate(DAY)).length, 0);
  store.set('kehadiran_' + DAY, JSON.stringify({oops: true}));
  eq(
    'object instead of array -> []',
    (await storage.getRecordsByDate(DAY)).length,
    0,
  );
  store.set(
    'kehadiran_' + DAY,
    JSON.stringify([
      {name: 'Sah', type: 'masuk', timestamp: new Date().toISOString()},
      null,
      42,
    ]),
  );
  eq(
    'invalid entries filtered out',
    (await storage.getRecordsByDate(DAY)).length,
    1,
  );
  store.set('kehadiran_' + DAY, 'null');
  eq('JSON null -> []', (await storage.getRecordsByDate(DAY)).length, 0);
  eq(
    'missing day -> []',
    (await storage.getRecordsByDate('2000-01-01')).length,
    0,
  );

  console.log('\n5) Summary counters');
  await reset();
  await storage.registerAttendance({
    name: 'Ali',
    jabatan: 'Operator',
    type: 'masuk',
    now: at(7, 55, 0),
  });
  await storage.registerAttendance({
    name: 'Bala',
    jabatan: 'Operator',
    type: 'masuk',
    now: at(8, 45, 0),
  });
  await storage.registerAttendance({
    name: 'Chong',
    jabatan: 'Teknikal',
    type: 'masuk',
    now: at(9, 0, 0),
  });
  await storage.registerAttendance({
    name: 'Ali',
    jabatan: 'Operator',
    type: 'keluar',
    now: at(17, 0, 0),
  });
  const s = storage.summarise(await storage.getRecordsByDate(DAY));
  eq('hadir counts unique workers', s.hadir, 3);
  eq('lewat counts late check-ins', s.lewat, 2);
  eq('sudah keluar counts check-outs', s.sudahKeluar, 1);
  eq('total records', s.jumlahRekod, 4);

  console.log('\n6) CSV export');
  await reset();
  r = await storage.exportToCSV(DAY);
  eq('empty day -> TIADA_REKOD (no crash)', r.code, 'TIADA_REKOD');
  eq('no file written for empty day', written.length, 0);

  await storage.registerAttendance({
    name: 'Ahmad, bin "Ali"',
    jabatan: 'Operator',
    type: 'masuk',
    now: at(8, 12, 0),
  });
  await storage.registerAttendance({
    name: 'Siti Nurhaliza',
    jabatan: 'Pengawas',
    type: 'masuk',
    now: at(8, 40, 0),
  });
  await storage.registerAttendance({
    name: 'Siti Nurhaliza',
    jabatan: 'Pengawas',
    type: 'keluar',
    now: at(17, 3, 0),
  });

  r = await storage.exportToCSV(DAY);
  check('export ok', r.ok === true, r && r.message);
  eq('file name', r.fileName, 'kehadiran_2026-10-20.csv');
  eq('location prefers Downloads', r.location, 'Muat Turun');
  eq('exports every record', r.count, 3);

  const fileText = fs.readFileSync(r.path, 'utf8');
  check('BOM present for Excel', fileText.charCodeAt(0) === 0xfeff);
  const body = fileText.replace(/^\uFEFF/, '');
  eq(
    'exact header',
    body.split('\r\n')[0],
    'Nama,Jabatan,Jenis,Masa,Tarikh,Status',
  );
  check('CRLF line endings', /\r\n/.test(body));
  check(
    'quotes/commas escaped RFC4180',
    body.indexOf('"Ahmad, bin ""Ali"""') > -1,
    body,
  );
  check(
    'rows sorted oldest first',
    body.indexOf('Ahmad') < body.indexOf('Siti'),
  );
  eq('trailing newline', body.slice(-2), '\r\n');

  console.log('\n7) Scoped-storage fallback (Android 10+ denied Downloads)');
  await reset();
  blockDownloads = true;
  await storage.registerAttendance({
    name: 'Fallback Test',
    jabatan: 'Teknikal',
    type: 'masuk',
    now: at(8, 0, 0),
  });
  r = await storage.exportToCSV(DAY);
  check(
    'still succeeds when Downloads is denied',
    r.ok === true,
    r && r.message,
  );
  eq('falls back to app documents', r.location, 'Storan Apl');
  check('fallback path is inside documents', r.path.indexOf(documents) === 0);

  console.log('\n8) Date helpers (no Intl / no moment)');
  eq('formatTime pads', dates.formatTime(at(7, 5, 9)), '07:05:09');
  eq('formatDate day-first', dates.formatDate(at(1, 2, 3)), '20/10/2026');
  eq('dateKey', dates.dateKey(at(23, 59, 59)), '2026-10-20');
  eq('isLate 08:30:00', dates.isLate(at(8, 30, 0)), false);
  eq('isLate 08:30:01', dates.isLate(at(8, 30, 1)), true);
  eq(
    'nameKey case/space insensitive',
    dates.nameKey('  Ahmad  Bin Ali '),
    'ahmad bin ali',
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
  .then(code => process.exit(code))
  .catch(error => {
    console.error('\nHARNESS ERROR:', error);
    process.exit(2);
  });
