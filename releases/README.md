# releases/

Canonical local home for the latest signed + notarized Ultravox `.dmg`.

## Where DMGs come from

`pnpm --filter @ultravox/app dmg` (which wraps `apps/ultravox/scripts/build-dmg.sh`) auto-copies its final notarized + stapled output here at the end of every successful build. The Cargo build directory at `apps/ultravox/src-tauri/target/release/bundle/dmg/` is the original output, but it's worktree-specific and gets buried when multiple git worktrees are in play — `releases/` is the single, repo-root-stable path.

## What's tracked

This `README.md` is the only file in this folder tracked by git. The `.dmg` artifacts themselves are gitignored — they're 9 MB+ binaries and belong on GitHub Releases or a package CDN, not the source tree. Old DMGs may accumulate here over time across iterations; clean up as needed.

## Manual override

If you want to ship the DMG somewhere else (e.g. `~/Desktop/` for ad-hoc handoff), just `cp releases/Ultravox_<version>_aarch64.dmg <wherever>` after the build. The notarization ticket is stapled to the DMG itself, so it survives any copy without losing Gatekeeper acceptance.

## Naming convention

`Ultravox_<semver>_aarch64.dmg` — matches the Tauri bundle output naming. Apple Silicon only for now; `x86_64` and `universal` builds would land alongside if/when added.
