/**
 * theme.js — single source of truth for colours, spacing and type sizes.
 *
 * Accessibility choices for a cheap Android phone used with gloves:
 *  - every text size >= 16sp (Android "Large" font setting still fits)
 *  - every tappable surface >= 56dp tall
 *  - 12dp radius cards, 4.5:1 minimum contrast on text
 */

export const COLORS = {
  primary: '#1a73e8', // blue header / primary action
  primaryDark: '#1557b0',
  primaryTint: '#e8f0fe',
  success: '#1e8e3e', // "DAFTAR MASUK" + "Baik" badge
  successTint: '#e6f4ea',
  danger: '#d93025', // "DAFTAR KELUAR" + "Lewat" badge
  dangerTint: '#fce8e6',
  warning: '#b06000',
  text: '#202124',
  textMuted: '#5f6368',
  background: '#f1f3f4',
  card: '#ffffff',
  border: '#dadce0',
  white: '#ffffff',
  disabled: '#9aa0a6',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  card: 12,
  button: 12,
  pill: 999,
};

export const FONT = {
  body: 16, // minimum size used anywhere in the app
  label: 16,
  value: 18,
  button: 18,
  title: 20,
  hero: 34, // live clock
};

export const TOUCH = {
  minHeight: 56,
};
