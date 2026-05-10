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
# Exact match for legacy ~/Desktop/Ultravox-0.9.4.dmg .DS_Store. Do NOT
# rescale these autonomously — the TIFF was painted for this exact layout.
APP_X=180       ; APP_Y=170
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

echo "→ deleting .DS_Store so AppleScript creates a fresh one with our bounds"
# Without this step, Finder reads the existing .DS_Store on open and
# uses its cached WindowBounds — overriding our AppleScript `set bounds`
# call. Deleting forces Finder to write a fresh .DS_Store from whatever
# our AppleScript leaves the window in.
rm -f "$MOUNT_POINT/.DS_Store"

echo "→ AppleScript reposition"
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "${VOLNAME}"
    try
      set current view of container window to icon view
    end try
    try
      -- Center the window on the user's display.
      set deskBounds to bounds of window of desktop
      set screenW to (item 3 of deskBounds) - (item 1 of deskBounds)
      set screenH to (item 4 of deskBounds) - (item 2 of deskBounds)
      set leftPos to ((screenW - ${WINDOW_W}) / 2) as integer
      set topPos to ((screenH - ${WINDOW_H}) / 2) as integer
      set the bounds of container window to {leftPos, topPos, leftPos + ${WINDOW_W}, topPos + ${WINDOW_H}}
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
    -- Park hidden items off-screen so they don't bleed into the
    -- visible window when the user has "show hidden files" enabled.
    -- (500, 600) is the tightest verified parking spot. y=600 is 60pt past the 540 bottom edge — far enough that the icon center plus its 64pt half-height clears the visible window. Legacy used (1500, 1100); confirmed empirically via reposition + visual check.
    try
      set position of item ".background" to {500, 600}
    end try
    try
      set position of item ".DS_Store" to {500, 600}
    end try
    try
      set position of item ".fseventsd" to {500, 600}
    end try
    try
      set position of item ".Trashes" to {500, 600}
    end try
    try
      set position of item ".Spotlight-V100" to {500, 600}
    end try
    try
      set position of item ".VolumeIcon.icns" to {500, 600}
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

# After AppleScript closes the window, Finder writes a fresh .DS_Store with
# Iloc records (icon positions) + view options. But it does NOT persist
# bwsp.WindowBounds — that's why the window opens at Finder's cached default
# size on next open. Inject bwsp.WindowBounds via ds_store directly. We
# only set the bwsp dict (which the library handles correctly); leaving Iloc
# alone avoids the ds_store __setitem__ tuple bug on Python 3.13.
echo "→ injecting bwsp.WindowBounds = {{200, 120}, {${WINDOW_W}, ${WINDOW_H}}}"
DS="$MOUNT_POINT/.DS_Store"
PYBIN=""
for c in /opt/homebrew/bin/python3 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /usr/local/bin/python3; do
  if [[ -x "$c" ]] && "$c" -c "import ds_store" >/dev/null 2>&1; then PYBIN="$c"; break; fi
done
[[ -z "$PYBIN" ]] && { echo "  ✗ no python with ds_store available; install via 'brew install python && /opt/homebrew/bin/python3 -m pip install ds_store mac_alias'"; exit 1; }
"$PYBIN" - "$DS" "${WINDOW_W}" "${WINDOW_H}" <<'PY'
import sys
from ds_store import DSStore
ds_path, w, h = sys.argv[1:]
w, h = int(w), int(h)
with DSStore.open(ds_path, "r+") as d:
    # Correct ds_store API: d[filename] returns a Partial, partial[code]
    # = value calls Partial.__setitem__. The d[fn, code] = v shorthand
    # silently goes through DSStore's missing __setitem__ and corrupts
    # the BTree with tuple-keyed entries.
    bwsp_partial = d["."]
    try:
        existing = bwsp_partial["bwsp"]
    except KeyError:
        existing = {}
    existing["WindowBounds"] = f"{{{{200, 120}}, {{{w}, {h}}}}}"
    bwsp_partial["bwsp"] = existing
print(f"  ✓ bwsp.WindowBounds set")
PY

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
