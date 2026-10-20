/**
 * metro.config.js
 * Defaults + one explicit choice: Hermes bytecode is produced by the Gradle
 * hermes-android task, not by Metro, so Metro stays vanilla. No experimental
 * transformer flags — those are the usual cause of "works in debug, blank
 * screen in release".
 */
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/** @type {import('metro-config').MetroConfig} */
const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true, // smaller startup work: modules load on first use
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
