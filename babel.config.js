/**
 * babel.config.js
 * RN 0.73 ships @react-native/babel-preset (Hermes-compatible transforms only:
 * no async-to-generator polyfill bloat, no regenerator on modern Hermes).
 */
module.exports = {
  presets: ['@react-native/babel-preset'],
};
