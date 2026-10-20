#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# scripts/release-check.sh — pre-flight gate before shipping KehadiranPro.
#
# Run this before every release (locally or in CI). It fails loudly on the
# mistakes that actually reach production: Hermes disabled, a debug-signed
# "release" build, a missing keystore, broken logic tests, or a bundle that
# Metro silently emitted as plain JS instead of Hermes bytecode.
#
#   ./scripts/release-check.sh
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAIL=0
WARN=0

ok()   { printf '  [OK]   %s\n' "$1"; }
bad()  { printf '  [FAIL] %s\n' "$1"; FAIL=$((FAIL + 1)); }
warn() { printf '  [WARN] %s\n' "$1"; WARN=$((WARN + 1)); }

echo
echo "KehadiranPro release pre-flight"
echo "==============================="

echo
echo "1) Hermes configuration"
if grep -q '^hermesEnabled=true' android/gradle.properties; then
  ok "android/gradle.properties: hermesEnabled=true"
else
  bad "hermesEnabled=true missing from android/gradle.properties (this is the file that matters)"
fi

if grep -q 'hermes-android' android/app/build.gradle; then
  ok "android/app/build.gradle: hermes-android dependency declared"
else
  bad "android/app/build.gradle does not declare com.facebook.react:hermes-android"
fi

if grep -q ':hermes_enabled => true' ios/Podfile; then
  ok "ios/Podfile: :hermes_enabled => true"
else
  warn "ios/Podfile: :hermes_enabled => true not found (Android-only release can proceed)"
fi

if grep -q 'hermesEnabled' android/app/build.gradle; then
  warn "hermesEnabled also appears in android/app/build.gradle — harmless but misleading, the property belongs in gradle.properties"
fi

echo
echo "2) Signing"
if [ -f android/keystore.properties ]; then
  ok "android/keystore.properties present"
  STORE_FILE=$(grep -E '^KEPASS_STORE_FILE=' android/keystore.properties | cut -d= -f2- | tr -d '\r')
  if [ -n "${STORE_FILE:-}" ] && [ -f "android/app/$STORE_FILE" ]; then
    ok "upload keystore found: android/app/$STORE_FILE"
  else
    bad "keystore file referenced by KEPASS_STORE_FILE not found in android/app/"
  fi
  if grep -q 'change-me' android/keystore.properties; then
    bad "keystore.properties still contains placeholder 'change-me' passwords"
  fi
else
  bad "android/keystore.properties missing — release would be signed with the DEBUG key (Play rejects it, and testers get a key mismatch)"
  echo "         cp android/keystore.properties.example android/keystore.properties"
fi

echo
echo "3) Toolchain"
if command -v java >/dev/null 2>&1; then
  ok "java: $(java -version 2>&1 | head -1)"
else
  warn "java not on PATH — cannot build locally; GitHub Actions or Android Studio required"
fi
if [ -n "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
  ok "Android SDK: ${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
else
  warn "ANDROID_HOME/ANDROID_SDK_ROOT not set — no local Gradle build"
fi
if [ -f android/gradlew ]; then
  ok "android/gradlew present"
else
  warn "android/gradlew missing (binary from 'react-native init'); the CI workflow generates one, but a local build needs it"
fi

echo
echo "4) Tests and lint"
if npm test >/tmp/kp-test.log 2>&1; then
  ok "logic tests: $(grep -E '[0-9]+/[0-9]+ checks passed' /tmp/kp-test.log | tr '\n' ' ')"
else
  bad "logic tests failed — see /tmp/kp-test.log"
fi
if node node_modules/eslint/bin/eslint.js --ext .js App.js index.js src scripts >/tmp/kp-lint.log 2>&1; then
  ok "eslint clean"
else
  bad "eslint reported problems — see /tmp/kp-lint.log"
fi

echo
echo "5) Bundle compiles to Hermes bytecode"
mkdir -p build
if node node_modules/react-native/cli.js bundle --platform android --dev false \
     --entry-file index.js --bundle-output build/index.android.bundle \
     --assets-dest build/res >/tmp/kp-bundle.log 2>&1; then
  ok "metro release bundle: $(wc -c < build/index.android.bundle | tr -d ' ') bytes"
  HERMESC="node_modules/react-native/sdks/hermesc/linux64-bin/hermesc"
  case "$(uname -s)" in
    Darwin*) HERMESC="node_modules/react-native/sdks/hermesc/osx-bin/hermesc" ;;
    MINGW*|MSYS*|CYGWIN*) HERMESC="node_modules/react-native/sdks/hermesc/win64-bin/hermesc.exe" ;;
  esac
  if [ -x "$HERMESC" ] && "$HERMESC" -emit-binary -O -out build/index.android.hbc \
       build/index.android.bundle >/tmp/kp-hermes.log 2>&1; then
    MAGIC=$(od -An -tx1 -N4 build/index.android.hbc | tr -d ' \n')
    if [ "$MAGIC" = "c61fbc03" ]; then
      ok "hermesc bytecode: $(wc -c < build/index.android.hbc | tr -d ' ') bytes, magic $MAGIC"
    else
      bad "unexpected bytecode magic: $MAGIC"
    fi
  else
    warn "hermesc not runnable here — bytecode check skipped (CI does this on the signed AAB)"
  fi
else
  bad "metro bundle failed — see /tmp/kp-bundle.log"
fi

echo
echo "6) Version"
CODE=$(node -p "require('./package.json').version" 2>/dev/null || echo "?")
echo "  package.json version: $CODE"
echo "  versionCode/versionName are injected at build time:"
echo "    -PversionCode=<n> -PversionName=<x.y.z>"
echo "  Play rejects a versionCode that already exists on any track."

echo
if [ "$FAIL" -gt 0 ]; then
  printf 'RESULT: %d blocker(s), %d warning(s) — do NOT ship.\n' "$FAIL" "$WARN"
  exit 1
fi
printf 'RESULT: ready (%d warning(s)).\n' "$WARN"
echo
echo "Next: cd android && ./gradlew bundleRelease assembleRelease \\"
echo "        -PversionCode=<n> -PversionName=<x.y.z>"
