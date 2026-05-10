#!/usr/bin/env bash
# Repositions the icons inside an EXISTING signed DMG, without rebuilding.
#
# Use when you're iterating on the icon layout (Ultravox / Applications /
# Uninstall positions) and don't want to spend 30s on Cargo + Tauri every
# time you nudge a coordinate. Reads the same APP_X / APP_Y / APPS_X /
# APPS_Y / UNINSTALL_X / UNINSTALL_Y values that build-dmg.sh uses, so
# you only edit them in one place (the `# ─── coordinates ───` block here).
#
# Run from anywhere:
#     pnpm --filter @ultravox/app reposition
# or directly:
#     bash apps/ultravox/scripts/reposition-dmg.sh
#
# Optionally pass an explicit DMG path:
#     bash apps/ultravox/scripts/reposition-dmg.sh path/to/Ultravox.dmg
#
# Workflow: edit coordinates → `pnpm reposition` → mount fresh DMG →
# screenshot → repeat until happy → finally `pnpm dmg` for a clean build
# with notarization.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DMG_DIR="$APP_DIR/src-tauri/target/release/bundle/dmg"

SIGN_IDENTITY="Developer ID Application: Benjamin Kurtz Academy LLC (3VP6Q6ZXN8)"
VOLNAME="Ultravox"
MOUNT_POINT="/Volumes/${VOLNAME}"
RW_DMG="/tmp/ultravox-reposition.dmg"

# ─── coordinates (single source of truth — keep in sync with build-dmg.sh) ──
WINDOW_W=660
WINDOW_H=540
ICON_SIZE=128
APP_X=180       ; APP_Y=170      # exact match to legacy 0.9.4 DMG
APPS_X=480      ; APPS_Y=170
UNINSTALL_X=330 ; UNINSTALL_Y=380

export PATH="/usr/bin:$PATH"

# Pick newest DMG unless explicit arg given.
if [[ $# -ge 1 ]]; then
  DMG_PATH="$1"
else
  DMG_PATH="$(ls -t "$DMG_DIR"/Ultravox_*.dmg 2>/dev/null | head -n1 || true)"
fi
if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "✗ No DMG found. Run 'pnpm dmg' first to produce an initial build."
  exit 1
fi
echo "→ repositioning icons in: $DMG_PATH"
echo "    Ultravox     ($APP_X, $APP_Y)"
echo "    Applications ($APPS_X, $APPS_Y)"
echo "    Uninstall    ($UNINSTALL_X, $UNINSTALL_Y)"

# Defensive: detach stale mount if any.
if [[ -d "$MOUNT_POINT" ]]; then
  hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1 || true
fi
rm -f "$RW_DMG"

echo "→ converting DMG → UDRW"
hdiutil convert "$DMG_PATH" -format UDRW -o "$RW_DMG" >/dev/null

echo "→ mounting at $MOUNT_POINT"
hdiutil attach "$RW_DMG" -mountpoint "$MOUNT_POINT" -noverify -nobrowse >/dev/null

echo "→ AppleScript reposition"
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

echo "→ unmounting (with retry)"
detach_retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1; then
      return 0
    fi
    osascript -e "tell application \"Finder\" to close (every window whose name is \"${VOLNAME}\")" >/dev/null 2>&1 || true
    sleep $((attempt * 2))
  done
  echo "✗ detach failed after 5 attempts; volume still busy at $MOUNT_POINT"
  return 1
}
detach_retry

echo "→ recompressing UDZO"
rm -f "$DMG_PATH"
hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" >/dev/null
rm -f "$RW_DMG"

echo "→ re-signing"
codesign --force --sign "$SIGN_IDENTITY" "$DMG_PATH"
codesign --verify --strict "$DMG_PATH"

echo
echo "✓ DMG repositioned: $DMG_PATH"
echo "  Note: notarization stripped (DMG was modified). For a final"
echo "  release-ready build, run 'pnpm --filter @ultravox/app notarize'"
echo "  to re-notarize, or 'pnpm dmg' for a full fresh build."
