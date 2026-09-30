// fetch with a deadline: a phone on a weak signal can leave a request hanging
// for minutes, and the screen would wait just as long. After `ms`, the request
// is aborted and the promise rejects with code "TIMEOUT".
export const DEFAULT_TIMEOUT_MS = 10000;

export function fetchWithTimeout(fetchImpl, url, options = {}, ms = DEFAULT_TIMEOUT_MS) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      const e = new Error("Délai dépassé.");
      e.code = "TIMEOUT";
      reject(e);
    }, ms);
  });
  const request = (fetchImpl || fetch)(url, controller ? { ...options, signal: controller.signal } : options);
  return Promise.race([request, deadline]).finally(() => clearTimeout(timer));
}
