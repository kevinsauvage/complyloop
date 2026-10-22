import type { Page } from "playwright-core";

/**
 * Probes that submit forms must never change state on the audited site: an
 * unrequired field passes native validation, so "submit empty" can reach a
 * real newsletter or contact endpoint.
 *
 * The guard lives in the page, not in Playwright routing. The scan already
 * owns a context-level route (SSRF / redirect guard); stacking a page-level
 * route on top of it raced ("Route is already handled!") and, uncaught,
 * killed the whole worker process. In-page, non-read `fetch` / XHR /
 * `sendBeacon` calls fail, and any form submission has its native navigation
 * cancelled after the page's own submit handlers have run. The audit reloads
 * the page after mutating probes, which drops the guard.
 */
function installWriteGuard(): void {
  const guarded = window as unknown as { __complyloopWriteGuard?: boolean };
  if (guarded.__complyloopWriteGuard) return;
  guarded.__complyloopWriteGuard = true;

  const isRead = (method: string | undefined): boolean =>
    method === undefined || /^(GET|HEAD|OPTIONS)$/i.test(method);

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method =
      init?.method ?? (input instanceof Request ? input.method : undefined);
    if (!isRead(method)) {
      return Promise.reject(new TypeError("Blocked by ComplyLoop audit"));
    }
    return nativeFetch(input, init);
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { __complyloopMethod?: string },
    method: string,
    ...rest: unknown[]
  ) {
    this.__complyloopMethod = method;
    return (nativeOpen as (...args: unknown[]) => void).call(
      this,
      method,
      ...rest,
    );
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { __complyloopMethod?: string },
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    if (!isRead(this.__complyloopMethod)) {
      throw new DOMException("Blocked by ComplyLoop audit", "NetworkError");
    }
    return nativeSend.call(this, body);
  };

  navigator.sendBeacon = () => false;

  // Bubble phase on `window`: runs after every handler the page attached to
  // the form, so its own validation / preventDefault logic still executes.
  window.addEventListener("submit", (event) => event.preventDefault());
}

export async function withBlockedWrites<T>(
  page: Page,
  run: () => Promise<T>,
): Promise<T> {
  await page.evaluate(installWriteGuard);
  return run();
}
