#!/usr/bin/env bash
# Production build → signed (and optionally notarized) DMG.
#
# Run from anywhere:
#     pnpm --filter @ultravox/app dmg
# or directly:
#     bash apps/ultravox/scripts/build-dmg.sh
#
# This script encapsulates four fragile build-environment fixes so they
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
#      If APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID are set, the script
#      notarizes the DMG (after we re-sign post-injection — see #3).
#      Otherwise it just signs. The .env.build file is .gitignored.
#
#   3. Inject Uninstall Ultravox.app into the DMG.
#      Tauri's DmgConfig schema doesn't support extra files on the DMG
#      window — only the app and the Applications drag-target. We work
#      around this by mounting the just-built DMG read-write, copying
#      the uninstaller in, positioning it via AppleScript, recompressing,
#      and re-signing. Source asset:
#          src-tauri/dmg-assets/Uninstall Ultravox.app
#
#   4. Re-sign + re-notarize after injection.
#      Tauri's signature on the DMG breaks the moment we modify the
#      contents. We re-codesign with the Developer ID identity, then if
#      Apple notarization env vars are set we run `xcrun notarytool
#      submit --wait` and `xcrun stapler staple` on the final DMG.
#
# Prereq the script can't fix: macOS Full Disk Access for the terminal.
# `hdiutil` cannot mount /Volumes/* without it. Grant via System Settings
# → Privacy & Security → Full Disk Access → Terminal / iTerm. One-time
# setup per machine.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

SIGN_IDENTITY="Developer ID Application: Benjamin Kurtz Academy LLC (3VP6Q6ZXN8)"
UNINSTALLER_SRC="$APP_DIR/src-tauri/dmg-assets/Uninstall Ultravox.app"
DMG_DIR="$APP_DIR/src-tauri/target/release/bundle/dmg"
VOLNAME="Ultravox"
MOUNT_POINT="/Volumes/${VOLNAME}"
RW_DMG="/tmp/ultravox-rw.dmg"

# Window/icon coordinates inside the DMG. Match the legacy 0.9.4 layout.
WINDOW_W=660
WINDOW_H=540
ICON_SIZE=128
APP_X=180 ; APP_Y=170            # extracted from legacy ~/Desktop/Ultravox-0.9.4.dmg .DS_Store
APPS_X=480; APPS_Y=170
UNINSTALL_X=330 ; UNINSTALL_Y=380

# ─── 0. Load notarization secrets if present ──────────────────────────
if [[ -f "$APP_DIR/.env.build" ]]; then
  echo "→ loading $APP_DIR/.env.build"
  set -o allexport
  # shellcheck disable=SC1091
  source "$APP_DIR/.env.build"
  set +o allexport
fi

# Tauri's bundler tries to notarize the .app inside the DMG when these
# vars are set. We DON'T want that — we'll notarize the final DMG
# ourselves after injecting the uninstaller (otherwise the signature
# breaks anyway). Stash + unset so Tauri only signs.
_APPLE_ID="${APPLE_ID:-}"
_APPLE_PASSWORD="${APPLE_PASSWORD:-}"
_APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

export PATH="/usr/bin:$PATH"

# ─── 1. Pre-flight checks ─────────────────────────────────────────────
if ! security find-identity -v -p codesigning | grep -q "$SIGN_IDENTITY"; then
  echo "✗ Codesign identity not found in keychain:"
  echo "    $SIGN_IDENTITY"
  echo "  Import the Developer ID Application certificate before building."
  exit 1
fi

if [[ ! -d "$UNINSTALLER_SRC" ]]; then
  echo "✗ Uninstaller asset missing: $UNINSTALLER_SRC"
  exit 1
fi

if [[ -n "$_APPLE_ID" && -n "$_APPLE_PASSWORD" && -n "$_APPLE_TEAM_ID" ]]; then
  WILL_NOTARIZE=1
  echo "→ notarization will run after DMG injection (APPLE_ID=$_APPLE_ID)"
else
  WILL_NOTARIZE=0
  echo "⚠ notarization skipped (no APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID in .env.build)"
fi

# Defensive: detach any leftover mount from a previous failed run.
if [[ -d "$MOUNT_POINT" ]]; then
  echo "→ detaching stale mount $MOUNT_POINT"
  hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1 || true
fi
rm -f "$RW_DMG"

# ─── 2. Build (Tauri signs the .app + DMG, but no notarization) ──────
echo "→ pnpm tauri build"
pnpm tauri build

DMG_PATH="$(ls -t "$DMG_DIR"/Ultravox_*.dmg 2>/dev/null | head -n1 || true)"
if [[ -z "$DMG_PATH" ]]; then
  echo "✗ Build finished but no DMG found in $DMG_DIR"
  exit 1
fi
echo "→ tauri produced: $DMG_PATH"

# ─── 3. Inject Uninstall Ultravox.app ─────────────────────────────────
echo "→ converting DMG to read-write for injection"
hdiutil convert "$DMG_PATH" -format UDRW -o "$RW_DMG" >/dev/null

echo "→ mounting $RW_DMG at $MOUNT_POINT"
hdiutil attach "$RW_DMG" -mountpoint "$MOUNT_POINT" -noverify -nobrowse >/dev/null

echo "→ copying Uninstall Ultravox.app onto the mounted volume"
cp -R "$UNINSTALLER_SRC" "$MOUNT_POINT/"

echo "→ positioning Uninstall icon at (${UNINSTALL_X}, ${UNINSTALL_Y})"
# Each setter is wrapped in `try` because newer macOS Finder rejects some
# of these on the volume's container window with -10006 ("Can't set …").
# We only really need the icon position setters; everything else is best-
# effort polish.
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "${VOLNAME}"
    try
      set current view of container window to icon view
    end try
    try
      set the bounds of container window to {200, 100, $((200 + WINDOW_W)), $((100 + WINDOW_H))}
    end try
    try
      set theViewOptions to the icon view options of container window
      set arrangement of theViewOptions to not arranged
      set icon size of theViewOptions to ${ICON_SIZE}
      -- Re-set background picture explicitly. Tauri's bundle_dmg.sh stages
      -- the TIFF at /Volumes/Ultravox/.background/background.tiff and writes
      -- it into the .DS_Store. When our AppleScript reopens the container
      -- window for icon-position edits, Finder rewrites .DS_Store and can
      -- drop the background reference if we don't reaffirm it here.
      set background picture of theViewOptions to file ".background:background.tiff"
    end try
    try
      set position of item "Ultravox.app" to {${APP_X}, ${APP_Y}}
    end try
    try
      set position of item "Applications" to {${APPS_X}, ${APPS_Y}}
    end try
    try
      set position of item "Uninstall Ultravox.app" to {${UNINSTALL_X}, ${UNINSTALL_Y}}
    end try
    try
      update without registering applications
    end try
    delay 0.5
    try
      close
    end try
  end tell
end tell
APPLESCRIPT

sync

echo "→ unmounting"
# hdiutil detach can fail with "resource busy" (exit 16) when Finder/Spotlight
# is still indexing or holding the just-mutated volume. Retry with backoff.
detach_retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1; then
      return 0
    fi
    # Quit Finder windows showing the volume so Finder releases it.
    osascript -e "tell application \"Finder\" to close (every window whose name is \"${VOLNAME}\")" >/dev/null 2>&1 || true
    sleep $((attempt * 2))
  done
  echo "✗ detach failed after 5 attempts; volume still busy at $MOUNT_POINT"
  return 1
}
detach_retry

echo "→ recompressing DMG (UDZO, level 9)"
rm -f "$DMG_PATH"
hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" >/dev/null
rm -f "$RW_DMG"

# ─── 4. Re-sign DMG ───────────────────────────────────────────────────
echo "→ re-signing DMG with $SIGN_IDENTITY"
codesign --force --sign "$SIGN_IDENTITY" "$DMG_PATH"
codesign --verify --strict "$DMG_PATH"

# ─── 5. Notarize (optional) ──────────────────────────────────────────
if [[ "$WILL_NOTARIZE" == "1" ]]; then
  echo "→ submitting to Apple notary service (this can take 1-5 min)"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$_APPLE_ID" \
    --password "$_APPLE_PASSWORD" \
    --team-id "$_APPLE_TEAM_ID" \
    --wait
  echo "→ stapling notarization ticket to DMG"
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
fi

# ─── Done ─────────────────────────────────────────────────────────────
echo
echo "✓ DMG ready: $DMG_PATH"
echo "  Size:    $(du -h "$DMG_PATH" | cut -f1)"
echo "  Signed:  $(codesign -dv "$DMG_PATH" 2>&1 | grep "^Authority" | head -1 | sed 's/^Authority=//')"
if [[ "$WILL_NOTARIZE" == "1" ]]; then
  echo "  Notary:  stapled"
fi
