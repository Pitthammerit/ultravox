#!/usr/bin/env bash
# Production build → signed (and optionally notarized) DMG.
#
# Run from anywhere:
#     pnpm --filter @ultravox/app build:dmg
# or directly:
#     bash apps/ultravox/scripts/build-dmg.sh
#
# This script encapsulates two fragile build-environment fixes so they
# never get rediscovered the next time someone tries to ship:
#
#   1. PATH=/usr/bin first.
#      Tauri's bundler runs `xattr -crs` on the .app to strip extended
#      attributes. The user has `~/Library/Python/3.9/bin/xattr` (the
#      Python xattr package) ahead of `/usr/bin` in their PATH. Python's
#      xattr doesn't support `-crs`, so the bundle step crashes with
#      `failed to run xattr`. Putting /usr/bin first makes Tauri pick
#      macOS's system xattr instead.
#
#   2. .env.build for notarization secrets (optional).
#      If APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID are set, Tauri will
#      automatically notarize the DMG after signing. Otherwise it just
#      signs (still distributable, but Gatekeeper shows a warning on
#      first launch). The .env.build file is .gitignored.
#
# Prereq the script can't fix: macOS Full Disk Access for the terminal.
# `hdiutil` cannot create/access /Volumes/Ultravox without it. Grant via
# System Settings → Privacy & Security → Full Disk Access → Terminal /
# iTerm / your shell of choice. One-time setup per machine.

set -euo pipefail

# Resolve the apps/ultravox dir (parent of this script's parent) so the
# script works whether you cd-in or call it via absolute path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# Load notarization secrets if present. .env.build is gitignored.
if [[ -f "$APP_DIR/.env.build" ]]; then
  echo "→ loading $APP_DIR/.env.build"
  set -o allexport
  # shellcheck disable=SC1091
  source "$APP_DIR/.env.build"
  set +o allexport
fi

# System xattr first; see header comment for rationale.
export PATH="/usr/bin:$PATH"

# Sanity check — bail early if codesign identity isn't available.
SIGN_IDENTITY="Developer ID Application: Benjamin Kurtz Academy LLC (3VP6Q6ZXN8)"
if ! security find-identity -v -p codesigning | grep -q "$SIGN_IDENTITY"; then
  echo "✗ Codesign identity not found in keychain:"
  echo "    $SIGN_IDENTITY"
  echo "  Import the Developer ID Application certificate before building."
  exit 1
fi

if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  echo "→ notarization enabled (APPLE_ID=$APPLE_ID, TEAM=$APPLE_TEAM_ID)"
else
  echo "⚠ notarization skipped (set APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID in .env.build to enable)"
fi

echo "→ pnpm tauri build"
pnpm tauri build

# Surface the artifact path so downstream scripts / humans don't have
# to guess the version-suffixed filename.
DMG_PATH="$(ls -t src-tauri/target/release/bundle/dmg/Ultravox_*.dmg 2>/dev/null | head -n1 || true)"
if [[ -n "$DMG_PATH" ]]; then
  ABS_PATH="$(cd "$(dirname "$DMG_PATH")" && pwd)/$(basename "$DMG_PATH")"
  echo
  echo "✓ DMG built: $ABS_PATH"
  echo "  Size: $(du -h "$ABS_PATH" | cut -f1)"
else
  echo "✗ Build finished but no DMG found in src-tauri/target/release/bundle/dmg/"
  exit 1
fi
