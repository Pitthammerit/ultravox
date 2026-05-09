#!/usr/bin/env bash
# Notarize and staple the most recently built DMG, without rebuilding.
#
# Use when:
#   - The DMG is already built + signed (e.g. `pnpm dmg` produced one
#     but failed at the notarytool step due to bad creds).
#   - You want to iterate on Apple credentials without spending 2 min
#     on another Cargo rebuild.
#
# Run from anywhere:
#     pnpm --filter @ultravox/app notarize
# or directly:
#     bash apps/ultravox/scripts/notarize-dmg.sh
#
# Optionally pass an explicit DMG path:
#     bash apps/ultravox/scripts/notarize-dmg.sh path/to/Ultravox.dmg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DMG_DIR="$APP_DIR/src-tauri/target/release/bundle/dmg"

# Pick the DMG: explicit arg, or newest in the bundle dir.
if [[ $# -ge 1 ]]; then
  DMG_PATH="$1"
else
  DMG_PATH="$(ls -t "$DMG_DIR"/Ultravox_*.dmg 2>/dev/null | head -n1 || true)"
fi

if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "✗ No DMG found. Build one first with: pnpm --filter @ultravox/app dmg"
  echo "  or pass an explicit path: bash $0 path/to/Ultravox.dmg"
  exit 1
fi

# Load credentials.
if [[ -f "$APP_DIR/.env.build" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$APP_DIR/.env.build"
  set +o allexport
fi

if [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "✗ Missing one or more required env vars in $APP_DIR/.env.build:"
  echo "    APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID"
  exit 1
fi

echo "→ DMG: $DMG_PATH"
echo "→ Apple ID: $APPLE_ID"
echo "→ Team: $APPLE_TEAM_ID"
echo

# Sanity-check creds with a cheap call before submitting a 10 MB blob.
echo "→ verifying credentials with notarytool history (1 round-trip)…"
if ! xcrun notarytool history \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      >/dev/null 2>&1; then
  echo
  echo "✗ Apple rejected those credentials (HTTP 401 or similar)."
  echo "  Common causes:"
  echo "    1. APPLE_PASSWORD is wrong / expired / revoked."
  echo "       → Regenerate at https://appleid.apple.com/account/manage"
  echo "         (sign in as $APPLE_ID, then \"Sign-In and Security\""
  echo "         → \"App-Specific Passwords\" → \"+\")"
  echo "    2. APPLE_ID isn't enrolled on team $APPLE_TEAM_ID."
  echo "       → Check developer.apple.com/account → Membership."
  echo "    3. APPLE_TEAM_ID is wrong."
  echo "       → Find the 10-char team ID in the top-right of"
  echo "         developer.apple.com/account."
  echo
  exit 1
fi
echo "✓ credentials valid"
echo

echo "→ submitting to Apple notary service (1-5 min)…"
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo "→ stapling notarization ticket"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

echo
echo "✓ notarized + stapled: $DMG_PATH"
echo "  Size:    $(du -h "$DMG_PATH" | cut -f1)"
