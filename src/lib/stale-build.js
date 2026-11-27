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

// Sometimes the missing module is the framework's client entry itself. Then the
// app never boots, no error boundary runs and no preload error is raised: the
// page just stays blank. This script is inlined into the document so it is
// already listening before any module is fetched, and reloads once (per minute)
// when one of the app's own module scripts fails to load.
export const BOOTSTRAP_GUARD_SCRIPT = [
  "(function () {",
  '  var KEY = "linetally-reloaded-at", WINDOW_MS = 60000;',
  "  function stale(message) {",
  '    return /must be used inside \\w*Provider|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed|Unable to preload CSS/i.test(String(message || ""));',
  "  }",
  "  function reload() {",
  "    try {",
  "      var last = Number(sessionStorage.getItem(KEY)) || 0;",
  "      if (Date.now() - last < WINDOW_MS) return;",
  "      sessionStorage.setItem(KEY, String(Date.now()));",
  "    } catch (e) { return; }",
  "    window.location.reload();",
  "  }",
  '  window.addEventListener("error", function (event) {',
  "    var target = event && event.target;",
  '    if (target && target.tagName === "SCRIPT" && target.src) {',
  "      var sameOrigin = target.src.indexOf(window.location.origin) === 0;",
  "      var appModule = /\\/assets\\/|\\/node_modules\\/|\\/src\\/|\\.tsx|\\.jsx/.test(target.src);",
  "      if (sameOrigin && appModule) reload();",
  "      return;",
  "    }",
  "    if (stale(event && event.message)) reload();",
  "  }, true);",
  '  window.addEventListener("unhandledrejection", function (event) {',
  "    var reason = event && event.reason;",
  "    if (stale((reason && reason.message) || reason)) reload();",
  "  });",
  "})();",
].join("\n");