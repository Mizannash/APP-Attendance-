/**
 * date.js — Date/time helpers for KehadiranPro.
 *
 * WHY NO `moment` / `Intl` HERE:
 * Hermes on Android ships without full ICU by default, so Intl.DateTimeFormat
 * can silently fall back to en-US (wrong date order for a Malaysian app) or
 * throw. moment works on Hermes but costs ~70 KB of parsed JS on every cold
 * start, which fights the <1.5 s target. All we need is HH:mm:ss and
 * DD/MM/YYYY, so we format from the native Date object directly:
 * zero dependencies, identical output on Hermes/JSC, no polyfill.
 *
 * All functions are pure and synchronous so they can be unit-tested in Node.
 */

const LATE_LIMIT_SECONDS = 8 * 60 * 60 + 30 * 60; // 08:30:00 local time

/** Two-digit zero pad. */
function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

/** "HH:mm:ss" — 24-hour clock, as required by the UI. */
function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return (
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
  );
}

/** "DD/MM/YYYY" — Malaysian day-first order. */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return (
    pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear()
  );
}

/** "YYYY-MM-DD" — used for AsyncStorage keys and CSV file names. */
function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  );
}

/** Seconds since local midnight (late-flag maths without string parsing). */
function secondsSinceMidnight(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/**
 * Late rule: strictly after 08:30:00 is "Lewat".
 * 08:30:00 exactly is on time; 08:30:01 is late.
 */
function isLate(date) {
  return secondsSinceMidnight(date) > LATE_LIMIT_SECONDS;
}

/** Human readable label for the UI / alert copy. */
function lateLabel(date) {
  return isLate(date) ? 'Lewat' : 'Baik';
}

/**
 * Collapse whitespace and trim. Guards against "  Ahmad " and "Ahmad  bin Ali"
 * being treated as two different workers.
 */
function normalizeName(name) {
  return String(name == null ? '' : name)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Case-insensitive worker identity. We key duplicates on this so
 * "ahmad" and "Ahmad" are the same person.
 */
function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

/**
 * Collision-resistant id without crypto (Hermes has no crypto.getRandomValues
 * without a polyfill, and we do not want a polyfill in the startup path).
 */
function makeId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  LATE_LIMIT_SECONDS,
  pad2,
  formatTime,
  formatDate,
  dateKey,
  secondsSinceMidnight,
  isLate,
  lateLabel,
  normalizeName,
  nameKey,
  makeId,
};
