// After a new version is published, a tab that was already open still runs the
// old code. Opening a page it hasn't loaded yet pulls in new code next to old
// code, which shows up as a failed module import or a context provider that
// can't be found. Reloading picks up the new version. Pure helpers, tested.

const PATTERNS = [
  /must be used inside \w*Provider/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading (CSS )?chunk .* failed/i,
  /Unable to preload CSS/i,
];

export const isStaleBuildError = (err) => PATTERNS.some((p) => p.test(String(err?.message ?? err ?? "")));

const KEY = "linetally-reloaded-at";
const WINDOW_MS = 60_000;

// Reload at most once a minute, so a real bug can't cause a reload loop.
export function shouldReload(storage, now = Date.now()) {
  let last = 0;
  try {
    last = Number(storage?.getItem(KEY)) || 0;
  } catch {
    return false;
  }
  if (now - last < WINDOW_MS) return false;
  try {
    storage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  return true;
}

export function reloadForNewVersion() {
  if (typeof window === "undefined") return false;
  if (!shouldReload(window.sessionStorage)) return false;
  window.location.reload();
  return true;
}
