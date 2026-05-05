/**
 * Theme runtime — runtime-agnostic.
 *
 * Owns the rules for which `data-theme` attribute is on `<html>` and exposes
 * a small async storage abstraction so each consuming app (Tauri, website)
 * can plug in its own persistence (tauri-plugin-store, localStorage, ...).
 *
 * The four user-facing choices:
 *   - 'auto'        follow the OS appearance; resolves to light or dark-ocean
 *   - 'light'       force the cream/navy light palette
 *   - 'dark-ocean'  force the navy dark palette (brand default for dark)
 *   - 'dark-night'  force the near-black dark palette
 *
 * `applyTheme('auto')` resolves once and writes the attribute. To keep `auto`
 * tracking the OS over time, also call `subscribeSystemAppearance` and
 * re-apply on change.
 */

export type ThemeChoice = "auto" | "light" | "dark-ocean" | "dark-night";

export const THEME_CHOICES: readonly ThemeChoice[] = [
  "auto",
  "light",
  "dark-ocean",
  "dark-night",
] as const;

/** When the user selects `auto` and the OS is in dark mode, this dark palette wins. */
export const AUTO_DARK_DEFAULT: Exclude<ThemeChoice, "auto" | "light"> =
  "dark-ocean";

const DATA_ATTR = "data-theme";

function isThemeChoice(v: unknown): v is ThemeChoice {
  return (
    typeof v === "string" &&
    (THEME_CHOICES as readonly string[]).includes(v)
  );
}

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Resolve a `ThemeChoice` to the concrete `data-theme` value (or null for light).
 * Light mode is the absence of `data-theme`, matching `tokens.css` `:root`.
 */
export function resolveTheme(choice: ThemeChoice): null | "dark-ocean" | "dark-night" {
  if (choice === "light") return null;
  if (choice === "dark-ocean") return "dark-ocean";
  if (choice === "dark-night") return "dark-night";
  return prefersDark() ? AUTO_DARK_DEFAULT : null;
}

/** Write (or remove) the `data-theme` attribute on `<html>`. No-op outside the browser. */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  if (resolved === null) {
    root.removeAttribute(DATA_ATTR);
  } else {
    root.setAttribute(DATA_ATTR, resolved);
  }
}

/**
 * Subscribe to OS appearance changes. Returns an unsubscribe function.
 * Only meaningful when the user has selected `'auto'` — apps should still
 * call this and re-apply, then ignore changes when the choice is pinned.
 */
export function subscribeSystemAppearance(
  cb: (isDark: boolean) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  // Modern browsers + WKWebView support addEventListener on MediaQueryList.
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

/**
 * Async storage interface. The Tauri app implements this against
 * `tauri-plugin-store`; the website would back it with `localStorage`.
 */
export interface ThemeStorage {
  get(): Promise<ThemeChoice | null>;
  set(choice: ThemeChoice): Promise<void>;
}

export interface ThemeController {
  getStoredTheme(): Promise<ThemeChoice>;
  setStoredTheme(choice: ThemeChoice): Promise<void>;
}

/**
 * Wrap a `ThemeStorage` with default handling and validation.
 * `getStoredTheme()` returns `'auto'` when the store is empty or corrupt.
 */
export function createThemeController(storage: ThemeStorage): ThemeController {
  return {
    async getStoredTheme() {
      const raw = await storage.get();
      return isThemeChoice(raw) ? raw : "auto";
    },
    async setStoredTheme(choice: ThemeChoice) {
      if (!isThemeChoice(choice)) {
        throw new Error(`Invalid ThemeChoice: ${String(choice)}`);
      }
      await storage.set(choice);
    },
  };
}

/** In-memory adapter, useful for tests and as a reference implementation. */
export function createMemoryThemeStorage(): ThemeStorage {
  let value: ThemeChoice | null = null;
  return {
    async get() {
      return value;
    },
    async set(choice) {
      value = choice;
    },
  };
}
