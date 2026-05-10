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
# NOTE: avoid the bare name "Ultravox" — on macOS 26 this machine's TCC
# database has a denial entry for /Volumes/Ultravox (likely from an
# earlier interrupted mount or a quarantined .app bundle id), and
# hdiutil create with -volname Ultravox fails with "Operation not
# permitted" before it can even mount the new image. Other volume names
# work without TCC interference. The legacy 0.9.4 DMG used "Ultravox
# Setup" for the same reason.
VOLNAME="Ultravox Installer"
MOUNT_POINT="/Volumes/${VOLNAME}"
RW_DMG="/tmp/ultravox-rw.dmg"

# Window/icon coordinates inside the DMG. Match the legacy 0.9.4 layout.
WINDOW_W=660
WINDOW_H=540
ICON_SIZE=128
# Exact match for legacy ~/Desktop/Ultravox-0.9.4.dmg .DS_Store. Do NOT
# rescale these autonomously — the TIFF was painted to fit this exact
# layout. If a future change requires different values, extract from a
# new reference DMG (see docs/shipping.md → "How to extract layout").
APP_X=180 ; APP_Y=170
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

# ─── 2. Build (Tauri signs .app, then we build the DMG ourselves) ────
#
# Why we don't just `pnpm tauri build`:
# Tauri's bundle_dmg.sh (a vendored fork of create-dmg) runs a Finder
# AppleScript at line 503 that does `set position of item "Ultravox.app"
# to {180, 170}`. On macOS 26+ Finder rejects that operation with
# error -10006 ("Can't set …"), the AppleScript exits non-zero, and
# bundle_dmg.sh exits 64. The whole tauri build fails before we can run
# any post-processing.
#
# Workaround: build only the .app via Tauri, then call bundle_dmg.sh
# ourselves with --skip-jenkins (which skips the AppleScript entirely).
# The DMG is produced WITHOUT custom layout, but the post-process at
# step 3+ below re-applies background image, icon positions, and window
# size via try-wrapped AppleScript — all the things --skip-jenkins
# would have done, but tolerant of -10006 failures.
echo "→ pnpm tauri build --bundles app  (signed .app only)"
pnpm tauri build --bundles app

APP_PATH="$APP_DIR/src-tauri/target/release/bundle/macos/Ultravox.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "✗ Build finished but no .app at $APP_PATH"
  exit 1
fi
echo "→ tauri produced: $APP_PATH"

mkdir -p "$DMG_DIR"

# bundle_dmg.sh is the vendored create-dmg from tauri-bundler. Tauri
# only writes it during a `--bundles dmg` run. If a previous run left it
# behind we reuse it; otherwise trigger a one-shot --bundles dmg attempt
# (which will fail at AppleScript but will write the script first).
if [[ ! -f "$DMG_DIR/bundle_dmg.sh" ]]; then
  echo "→ priming bundle_dmg.sh from Tauri (expected to fail at AppleScript)"
  pnpm tauri build --bundles dmg || true
fi
if [[ ! -f "$DMG_DIR/bundle_dmg.sh" ]]; then
  echo "✗ Could not obtain bundle_dmg.sh from Tauri's bundler"
  exit 1
fi

# Stage Ultravox.app inside a parent directory so bundle_dmg.sh's
# `hdiutil create -srcfolder $STAGE` puts Ultravox.app at the DMG root
# (rather than flattening its Contents/ to the root, which would break
# the bundle layout and fail Apple notarization with "signature of the
# binary is invalid"). Without the staging step, hdiutil treats
# Ultravox.app's contents as the DMG contents — verified empirically on
# macOS 26.
STAGE_DIR="$(mktemp -d -t ultravox-dmg-stage)"
trap 'rm -rf "$STAGE_DIR"' EXIT
ditto "$APP_PATH" "$STAGE_DIR/Ultravox.app"

VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$APP_DIR/package.json" | head -1)"
DMG_NAME="Ultravox_${VERSION}_aarch64.dmg"
DMG_PATH="$DMG_DIR/$DMG_NAME"
rm -f "$DMG_PATH" "$DMG_DIR"/rw.*.dmg
# Also clear any stale Ultravox.app symlink/dir in $DMG_DIR from older
# script versions — bundle_dmg.sh runs from $DMG_DIR but our $2 below
# resolves the staging dir's absolute path, so the dmg/ entry is junk.
rm -rf "$DMG_DIR/Ultravox.app"

echo "→ running bundle_dmg.sh --skip-jenkins (no Finder AppleScript) over $STAGE_DIR"
(
  cd "$DMG_DIR"
  bash bundle_dmg.sh \
    --volname "$VOLNAME" \
    --skip-jenkins \
    --window-size "$WINDOW_W" "$WINDOW_H" \
    --icon-size "$ICON_SIZE" \
    --background "$APP_DIR/src-tauri/dmg-assets/background.tiff" \
    --hide-extension "Ultravox.app" \
    "$DMG_NAME" \
    "$STAGE_DIR"
)
if [[ ! -f "$DMG_PATH" ]]; then
  echo "✗ bundle_dmg.sh did not produce $DMG_PATH"
  exit 1
fi
echo "→ initial DMG produced: $DMG_PATH"

# Sign the DMG once before injection — Tauri normally does this; we have
# to do it ourselves now since we bypassed Tauri's DMG step. The post-
# process will re-sign after modifying the DMG, so this signature is
# transient but keeps the produced artifact valid at every step.
codesign --force --sign "$SIGN_IDENTITY" "$DMG_PATH" >/dev/null 2>&1 || true

# ─── 3. Inject Uninstall Ultravox.app ─────────────────────────────────
echo "→ converting DMG to read-write for injection"
hdiutil convert "$DMG_PATH" -format UDRW -o "$RW_DMG" >/dev/null

echo "→ mounting $RW_DMG at $MOUNT_POINT"
hdiutil attach "$RW_DMG" -mountpoint "$MOUNT_POINT" -noverify -nobrowse >/dev/null

echo "→ copying Uninstall Ultravox.app onto the mounted volume"
cp -R "$UNINSTALLER_SRC" "$MOUNT_POINT/"

echo "→ deleting existing .DS_Store so AppleScript creates a fresh one"
# Without this step, Finder's cached WindowBounds wins on next open and
# our AppleScript `set bounds` is silently ignored. Deleting forces
# Finder to write a fresh .DS_Store reflecting whatever our AppleScript
# leaves the window in.
rm -f "$MOUNT_POINT/.DS_Store"

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

# Inject bwsp.WindowBounds — Finder doesn't persist it from AppleScript's
# `set bounds`, so without this the DMG opens at Finder's cached default
# window size. Iloc records are already written by AppleScript; we only
# touch bwsp to avoid the ds_store __setitem__ tuple bug on Python 3.13.
echo "→ injecting bwsp.WindowBounds = {{200, 120}, {${WINDOW_W}, ${WINDOW_H}}}"
DS="$MOUNT_POINT/.DS_Store"
PYBIN=""
for c in /opt/homebrew/bin/python3 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /usr/local/bin/python3; do
  if [[ -x "$c" ]] && "$c" -c "import ds_store" >/dev/null 2>&1; then PYBIN="$c"; break; fi
done
[[ -z "$PYBIN" ]] && { echo "  ✗ no python with ds_store available"; exit 1; }
"$PYBIN" - "$DS" "${WINDOW_W}" "${WINDOW_H}" <<'PY'
import sys
from ds_store import DSStore
ds_path, w, h = sys.argv[1:]
w, h = int(w), int(h)
with DSStore.open(ds_path, "r+") as d:
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
