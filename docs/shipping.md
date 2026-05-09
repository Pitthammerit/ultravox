# Shipping Ultravox

How to produce a `.app` for testing or a fully signed + notarized `.dmg` for
release. Read this end-to-end **once**; after that the commands are short.

---

## TL;DR

| Goal                                  | Command                                      | Output                                                |
|---------------------------------------|----------------------------------------------|-------------------------------------------------------|
| Test the app on your Mac              | `pnpm --filter @ultravox/app app`            | `apps/ultravox/src-tauri/target/release/bundle/macos/Ultravox.app` |
| Release-ready DMG (signed, notarized) | `pnpm --filter @ultravox/app dmg`            | `apps/ultravox/src-tauri/target/release/bundle/dmg/Ultravox_<ver>_aarch64.dmg` |

Run from the repo root or anywhere — the script resolves paths itself.

---

## Where things live

| What                       | Path                                                                |
|----------------------------|---------------------------------------------------------------------|
| Build script               | `apps/ultravox/scripts/build-dmg.sh`                                |
| Tauri bundle config        | `apps/ultravox/src-tauri/tauri.conf.json` → `bundle.macOS`          |
| DMG background (1600×1200) | `apps/ultravox/src-tauri/dmg-assets/background.tiff`                |
| Uninstaller (.app)         | `apps/ultravox/src-tauri/dmg-assets/Uninstall Ultravox.app`         |
| Apple credentials          | `apps/ultravox/.env.build`  *(gitignored, never committed)*         |
| Credential template        | `apps/ultravox/.env.build.example`                                  |
| Reference DMG (legacy 0.9.4) | `~/Desktop/Ultravox-0.9.4.dmg`  *(your machine; not in repo)*     |
| Built `.app`               | `apps/ultravox/src-tauri/target/release/bundle/macos/Ultravox.app`  |
| Built `.dmg`               | `apps/ultravox/src-tauri/target/release/bundle/dmg/Ultravox_<ver>_aarch64.dmg` |

Replacing the TIFF or the uninstaller is just "drop a new file at the path
above and re-run `pnpm dmg`." No config edits needed.

---

## Apple credentials

Notarization needs three values. They go in **`apps/ultravox/.env.build`**
(file is `.gitignored`):

```bash
APPLE_ID="kurtzfilm@me.com"
APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # an *app-specific password*, not your login password
APPLE_TEAM_ID="3VP6Q6ZXN8"
```

- **APPLE_ID** is the Apple ID enrolled in your Developer Program.
- **APPLE_PASSWORD** is an app-specific password. Generate at
  <https://appleid.apple.com/account/manage> → "Sign-In and Security" →
  "App-Specific Passwords" → "+" → label it "ultravox-notarization".
  *Never use your real Apple ID password here.*
- **APPLE_TEAM_ID** is the 10-character team identifier visible at
  <https://developer.apple.com/account> in the top-right.

The file is never committed. If you nuke your machine, recreate it from
`.env.build.example` — that's why the example is checked in.

If `.env.build` is missing or any of the three vars is empty, the script
**signs but skips notarization**. The DMG is still distributable but
Gatekeeper will warn first-time users.

---

## Codesigning identity

The Developer ID identity must be in your Login keychain:

```
Developer ID Application: Benjamin Kurtz Academy LLC (3VP6Q6ZXN8)
```

Verify with:

```bash
security find-identity -v -p codesigning
```

The script aborts before the 2-min Cargo build if it doesn't find this
identity. If it's missing, import the `.p12` certificate (it lives in
`~/Documents/localcoding/ultravox/certificate apple/` — outside git).

---

## One-time machine setup

### 1. Full Disk Access on your terminal

`hdiutil` cannot mount/access `/Volumes/*` without it. Without FDA, the
DMG step fails partway through with:

```
hdiutil: create failed - Operation not permitted
```

Fix: **System Settings → Privacy & Security → Full Disk Access** → click
the `+` and add **Terminal.app** (or iTerm.app, whatever you use). Quit
and relaunch the terminal afterwards.

This is a per-app TCC permission. It can't be granted from the script.

### 2. PATH ordering for `xattr`

The script forces `/usr/bin` first via `export PATH="/usr/bin:$PATH"`, so
you don't need to fix your shell config. *Why this is needed:* if you
have `pip install xattr` installed (it ends up in `~/Library/Python/3.9/bin`),
that Python `xattr` shadows macOS `/usr/bin/xattr`. Tauri's bundler runs
`xattr -crs <app>` to strip extended attributes; the Python `xattr`
doesn't support `-crs` and the build dies with `failed to run xattr`.

The script handles this. You don't.

---

## Building a `.app` for testing

```bash
pnpm --filter @ultravox/app app
```

This skips DMG creation entirely — just compiles, signs the `.app` with
Developer ID, drops it at:

```
apps/ultravox/src-tauri/target/release/bundle/macos/Ultravox.app
```

Drag that into `/Applications` to install for testing. Right-click → Open
the first time if Gatekeeper complains (it shouldn't, since the `.app`
is signed).

Use this whenever you want to verify "does the production build still
boot?" without spending another minute on DMG packaging.

---

## Building the release DMG

```bash
pnpm --filter @ultravox/app dmg
```

What the script does, in order:

1. **Loads `.env.build`** (if present) to pick up Apple credentials.
2. **Saves & unsets** `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`
   from Tauri's view — we don't want Tauri to notarize a DMG we're
   about to modify.
3. **Pre-flight**: confirms the Developer ID cert is in the keychain
   and the uninstaller asset exists on disk.
4. **Runs `pnpm tauri build`**:
   - Vite production frontend bundle (~1s)
   - Cargo `release` build (~25s warm, ~2min cold)
   - `xattr -crs` cleanup (needs `/usr/bin/xattr`, see above)
   - Codesign the `.app` with Developer ID
   - `bundle_dmg.sh` builds the DMG with the TIFF background, app at
     left, Applications symlink at right
   - Codesign the DMG itself
5. **Mounts the DMG read-write** at `/Volumes/Ultravox` (needs FDA).
6. **Copies `Uninstall Ultravox.app`** onto the volume.
7. **Repositions all three icons** via AppleScript:
   - `Ultravox.app` at (220, 240)
   - `Applications` at (580, 240)
   - `Uninstall Ultravox.app` at (400, 460)
8. **Unmounts**, recompresses (UDZO level 9), **re-signs** the DMG
   (the modification broke the original signature).
9. **Notarizes** — only if all three Apple env vars are set:
   - `xcrun notarytool submit --wait` — 1-5 min round-trip to Apple
   - `xcrun stapler staple` — embeds the notarization ticket so the
     DMG works offline
10. Prints the final path + size + signing authority.

If anything fails partway, re-running is safe — `set -euo pipefail`
aborts on first error, and the script auto-detaches stale mounts at
startup.

---

## Editing the DMG layout

Three things you might change, all in `apps/ultravox/`:

- **Background image**: replace `src-tauri/dmg-assets/background.tiff`.
  Use a 2× retina TIFF (so 800×600 logical → 1600×1200 pixels).
- **Window dimensions or app/Applications icon position**: edit
  `src-tauri/tauri.conf.json` → `bundle.macOS.dmg.windowSize` /
  `appPosition` / `applicationFolderPosition`.
- **Uninstaller icon position**: edit `UNINSTALL_X` / `UNINSTALL_Y` near
  the top of `scripts/build-dmg.sh`.

If you change `windowSize`, also bump the matching coords in the script.

The reference DMG that the layout mirrors lives at
`~/Desktop/Ultravox-0.9.4.dmg`. Keep it around — that's where the TIFF
and the uninstaller `.app` were originally extracted from. Mount it
(`open ~/Desktop/Ultravox-0.9.4.dmg`) any time you want to compare.

---

## Versioning before each ship

Bump the patch in **all three** files in lockstep:

```
apps/ultravox/package.json              "version": "0.x.y"
apps/ultravox/src-tauri/Cargo.toml      version = "0.x.y"
apps/ultravox/src-tauri/tauri.conf.json "version": "0.x.y"
```

Why we always bump: macOS caches `(CFBundleIdentifier, CFBundleVersion)`
for icons and quarantine flags. Re-shipping the same version serves the
cached state forever. Always-bump side-steps it.

Minor (`0.x → 0.y`) and major (`0 → 1`) bumps are deliberate decisions —
ask before doing them.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `failed to run xattr` | Python `xattr` ahead of system one in PATH | Already fixed by script's `PATH=/usr/bin:$PATH`. If you ran `pnpm tauri build` directly, use `pnpm dmg` instead. |
| `hdiutil: create failed - Operation not permitted` | Terminal lacks Full Disk Access | Grant FDA in System Settings (see one-time setup above). |
| `Codesign identity not found in keychain` | Cert missing or expired | Import `~/Documents/localcoding/ultravox/certificate apple/*.p12` into Login keychain. |
| `Finder got an error: Can't set toolbar visible …` | Newer macOS Finder dropped that property | Already wrapped in `try` blocks in the script. If it surfaces, the layout still works — just less polished. |
| `notarytool: invalid credentials` | Stale app-specific password | Regenerate at <https://appleid.apple.com> and update `.env.build`. |
| `notarytool: status: Invalid` | Hardened runtime, entitlements, or signature issue | Read the JSON log it prints; usually missing entitlement or wrong identity. |
