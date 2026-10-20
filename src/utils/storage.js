/**
 * storage.js — data layer for KehadiranPro.
 *
 * One AsyncStorage key per day:   kehadiran_YYYY-MM-DD  ->  JSON array of records
 *
 * Record shape (all fields are strings so the CSV is trivial and Hermes does
 * no shape guessing):
 *   {
 *     id:        'lq3k9x-8f2a1c'      // local id, no crypto needed
 *     name:      'Ahmad bin Ali'      // normalised (trimmed, single spaces)
 *     jabatan:   'Operator'           // Operator | Teknikal | Pengawas
 *     type:      'masuk' | 'keluar'
 *     timestamp: '2026-10-20T08:42:10.512+08:00'  // ISO, used for sorting
 *     time:      '08:42:10'           // HH:mm:ss, pre-computed for display
 *     date:      '20/10/2026'         // DD/MM/YYYY
 *     dateKey:   '2026-10-20'         // YYYY-MM-DD (bucket + CSV name)
 *     status:    'Baik' | 'Lewat'     // check-out is always 'Baik'
 *   }
 *
 * Every read path is defensive: corrupt JSON, wrong types, a half-written
 * array, or a storage engine that throws all degrade to [] instead of
 * crashing the app. Writes that fail are reported to the caller as
 * {ok:false, code, message} so the screen can show a real Alert.
 */

const AsyncStorageModule = require('@react-native-async-storage/async-storage');
const AsyncStorage =
  AsyncStorageModule && AsyncStorageModule.default
    ? AsyncStorageModule.default
    : AsyncStorageModule;

// Static require on purpose: Hermes bytecode cannot resolve dynamic requires
// (no `require(variable)` and no lazy module paths in a compiled bundle).
const RNFS = require('react-native-fs');

const {
  dateKey,
  formatDate,
  formatTime,
  isLate,
  makeId,
  nameKey,
  normalizeName,
} = require('./date');

const KEY_PREFIX = 'kehadiran_';
const JABATAN_LIST = ['Operator', 'Teknikal', 'Pengawas'];
const TYPE_LIST = ['masuk', 'keluar'];

const CSV_HEADER = 'Nama,Jabatan,Jenis,Masa,Tarikh,Status';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function storageKey(dayKey) {
  return KEY_PREFIX + dayKey;
}

function fail(code, message) {
  return {ok: false, code: code, message: message};
}

/** Reject anything that cannot be rendered or exported safely. */
function isValidRecord(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (typeof record.name !== 'string' || record.name.length === 0) {
    return false;
  }
  if (TYPE_LIST.indexOf(record.type) === -1) {
    return false;
  }
  if (
    typeof record.timestamp !== 'string' ||
    isNaN(Date.parse(record.timestamp))
  ) {
    return false;
  }
  return true;
}

function byTimestampAsc(a, b) {
  return Date.parse(a.timestamp) - Date.parse(b.timestamp);
}

/** Read + parse one day bucket. Always resolves to an array. */
async function readRaw(dayKey) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(dayKey));
    if (!raw || typeof raw !== 'string') {
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      // Corrupt payload: keep the bad string around for debugging, then reset.
      console.warn('[storage] JSON rosak untuk ' + dayKey + ', diabaikan');
      return [];
    }
    if (!Array.isArray(parsed)) {
      console.warn(
        '[storage] Data bukan array untuk ' + dayKey + ', diabaikan',
      );
      return [];
    }
    return parsed.filter(isValidRecord);
  } catch (error) {
    console.warn('[storage] getItem gagal: ' + (error && error.message));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getRecordsByDate('2026-10-20') -> Promise<Record[]>
 * Omit the argument for today. Sorted oldest -> newest.
 */
async function getRecordsByDate(dayKey) {
  const key = dayKey || dateKey(new Date());
  const records = await readRaw(key);
  return records.slice().sort(byTimestampAsc);
}

/**
 * saveRecord(record) -> Promise<Record>
 * Appends one record to its day bucket. Throws if the write fails so callers
 * can decide how loud to be (registerAttendance turns it into a friendly
 * Alert message).
 */
async function saveRecord(record) {
  if (!isValidRecord(record)) {
    throw new Error('Rekod tidak sah');
  }
  const key = record.dateKey || dateKey(new Date(record.timestamp));
  try {
    const existing = await readRaw(key);
    const next = existing.concat([record]);
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(next));
    return record;
  } catch (error) {
    console.warn('[storage] saveRecord gagal: ' + (error && error.message));
    throw error;
  }
}

/**
 * getWorkerState(name, dayKey) -> {openRecord, lastRecord}
 * `openRecord` is the unmatched check-in for this worker today (null when the
 * worker is checked out / has not checked in). This is the single rule used to
 * block duplicate check-ins and orphan check-outs.
 */
async function getWorkerState(name, dayKey) {
  const wanted = nameKey(name);
  const records = await getRecordsByDate(dayKey);
  if (!wanted) {
    return {openRecord: null, lastRecord: null};
  }
  let openRecord = null;
  let lastRecord = null;
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (nameKey(record.name) !== wanted) {
      continue;
    }
    lastRecord = record;
    if (record.type === 'masuk') {
      openRecord = record;
    } else if (record.type === 'keluar') {
      openRecord = null;
    }
  }
  return {openRecord: openRecord, lastRecord: lastRecord};
}

/**
 * registerAttendance({name, jabatan, type}) -> Promise<{ok, ...}>
 * The whole business rule lives here (not in the screen) so it is testable:
 *   - empty / too-short name           -> NAMA_KOSONG
 *   - check-in twice without check-out -> SUDAH_MASUK   (Alert warning)
 *   - check-out without check-in       -> BELUM_MASUK
 *   - write failure                    -> SIMPAN_GAGAL
 */
async function registerAttendance(params) {
  const input = params || {};
  const name = normalizeName(input.name);
  const type = input.type;
  const jabatan =
    JABATAN_LIST.indexOf(input.jabatan) === -1 ? 'Operator' : input.jabatan;
  const now = input.now instanceof Date ? input.now : new Date();

  if (name.length < 2) {
    return fail(
      'NAMA_KOSONG',
      'Sila masukkan nama pekerja (sekurang-kurangnya 2 huruf).',
    );
  }
  if (TYPE_LIST.indexOf(type) === -1) {
    return fail('JENIS_TIDAK_SAH', 'Jenis rekod tidak sah.');
  }

  const dayKey = dateKey(now);
  const state = await getWorkerState(name, dayKey);

  if (type === 'masuk' && state.openRecord) {
    return fail(
      'SUDAH_MASUK',
      '"' +
        name +
        '" sudah mendaftar masuk pada ' +
        state.openRecord.time +
        ' dan belum mendaftar keluar.\n\nSila tekan DAFTAR KELUAR dahulu.',
    );
  }

  if (type === 'keluar' && !state.openRecord) {
    return fail(
      'BELUM_MASUK',
      'Tiada rekod masuk untuk "' +
        name +
        '" hari ini.\n\nSila tekan DAFTAR MASUK dahulu.',
    );
  }

  const late = type === 'masuk' ? isLate(now) : false;

  const record = {
    id: makeId(),
    name: name,
    jabatan: jabatan,
    type: type,
    timestamp: now.toISOString(),
    time: formatTime(now),
    date: formatDate(now),
    dateKey: dayKey,
    status: late ? 'Lewat' : 'Baik',
  };

  try {
    await saveRecord(record);
  } catch (error) {
    return fail(
      'SIMPAN_GAGAL',
      'Rekod tidak dapat disimpan. Sila cuba lagi.\n(' +
        (error && error.message) +
        ')',
    );
  }

  return {ok: true, record: record, late: late};
}

/** RFC 4180 cell: quote when the value contains a comma, quote or newline. */
function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function jenisLabel(type) {
  return type === 'masuk' ? 'Masuk' : 'Keluar';
}

/** Build the CSV body (no BOM) from records. Pure, exported for tests. */
function buildCSV(records) {
  const rows = [CSV_HEADER];
  (records || [])
    .slice()
    .sort(byTimestampAsc)
    .forEach(function (record) {
      rows.push(
        [
          csvCell(record.name),
          csvCell(record.jabatan),
          csvCell(jenisLabel(record.type)),
          csvCell(record.time),
          csvCell(record.date),
          csvCell(record.status),
        ].join(','),
      );
    });
  return rows.join('\r\n') + '\r\n';
}

/**
 * exportToCSV('2026-10-20') -> Promise<{ok, path, fileName, count, csv}>
 *
 * Writes kehadiran_YYYY-MM-DD.csv with a UTF-8 BOM so Excel (the tool the
 * payroll clerk actually uses) does not mangle "Jabatan" or Malay names.
 *
 * Android 10+ scoped storage blocks writes to /storage/emulated/0/Download
 * unless the app has legacy storage access, so we TRY Downloads first (nice
 * for the user, visible in the Files app) and fall back to the app's private
 * documents folder, which always works and is still shareable via
 * react-native-share. The returned `path` is whatever actually got written.
 */
async function exportToCSV(dayKey) {
  const key = dayKey || dateKey(new Date());
  try {
    const records = await getRecordsByDate(key);
    if (records.length === 0) {
      return fail(
        'TIADA_REKOD',
        'Tiada rekod untuk dieksport pada tarikh ini.',
      );
    }

    const csv = buildCSV(records);
    const body = '\uFEFF' + csv; // BOM for Excel
    const fileName = 'kehadiran_' + key + '.csv';

    let path = RNFS.DownloadDirectoryPath + '/' + fileName;
    let location = 'Muat Turun';
    try {
      await RNFS.writeFile(path, body, 'utf8');
    } catch (downloadError) {
      path = RNFS.DocumentDirectoryPath + '/' + fileName;
      location = 'Storan Apl';
      await RNFS.writeFile(path, body, 'utf8');
    }

    return {
      ok: true,
      path: path,
      location: location,
      fileName: fileName,
      count: records.length,
      csv: csv,
    };
  } catch (error) {
    console.warn('[storage] exportToCSV gagal: ' + (error && error.message));
    return fail(
      'EKSPORT_GAGAL',
      'Fail CSV tidak dapat disimpan. Sila cuba lagi.\n(' +
        (error && error.message) +
        ')',
    );
  }
}

/** Lightweight counters for the Rekod screen. Pure, exported for tests. */
function summarise(records) {
  const checkedIn = {};
  const checkedOut = {};
  let lewat = 0;
  (records || []).forEach(function (record) {
    const key = nameKey(record.name);
    if (record.type === 'masuk') {
      checkedIn[key] = true;
      if (record.status === 'Lewat') {
        lewat += 1;
      }
    } else {
      checkedOut[key] = true;
    }
  });
  return {
    hadir: Object.keys(checkedIn).length,
    lewat: lewat,
    sudahKeluar: Object.keys(checkedOut).length,
    jumlahRekod: (records || []).length,
  };
}

module.exports = {
  JABATAN_LIST,
  CSV_HEADER,
  storageKey,
  getRecordsByDate,
  saveRecord,
  getWorkerState,
  registerAttendance,
  exportToCSV,
  buildCSV,
  csvCell,
  summarise,
  isValidRecord,
  readRaw,
};
