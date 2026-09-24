import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./custom-checks/playwright-page";
import { registerPlaywrightBrowserTeardown } from "./custom-checks/playwright-test-teardown";
import {
  gotoForRuntimeAudit,
  runtimePageMatchesAuditedUrl,
} from "./runtime-navigation";

registerPlaywrightBrowserTeardown();

describe("runtimePageMatchesAuditedUrl", () => {
  it("matches origin + pathname, ignoring query and hash", () => {
    expect(
      runtimePageMatchesAuditedUrl(
        "https://app.example/guide?x=1#top",
        "https://app.example/guide",
      ),
    ).toBe(true);
  });

  it("ignores trailing-slash drift", () => {
    expect(
      runtimePageMatchesAuditedUrl(
        "https://app.example/guide/",
        "https://app.example/guide",
      ),
    ).toBe(true);
  });

  it("rejects cross-origin, path drift, and garbage URLs", () => {
    expect(
      runtimePageMatchesAuditedUrl(
        "https://evil.example/guide",
        "https://app.example/guide",
      ),
    ).toBe(false);
    expect(
      runtimePageMatchesAuditedUrl(
        "https://app.example/other",
        "https://app.example/guide",
      ),
    ).toBe(false);
    expect(runtimePageMatchesAuditedUrl("not a url", "also not")).toBe(false);
    expect(
      runtimePageMatchesAuditedUrl("https://app.example/guide", "bogus"),
    ).toBe(false);
  });
});

interface StubOptions {
  status: number;
  url: string;
  hasDocument: boolean;
  styleTagThrows?: boolean;
}

/** Minimal Page double — no Chromium needed (scan.test.ts precedent). */
function stubPage(options: StubOptions): Page {
  let evaluates = 0;
  return {
    goto: async () => ({ status: () => options.status }),
    addStyleTag: async () => {
      if (options.styleTagThrows) throw new Error("style-src blocked");
    },
    evaluate: async () => {
      evaluates += 1;
      return evaluates === 1 ? undefined : options.hasDocument;
    },
    waitForTimeout: async () => undefined,
    url: () => options.url,
  } as unknown as Page;
}

describe("gotoForRuntimeAudit", () => {
  it("resolves on a 200 page that renders a document", async () => {
    await expect(
      gotoForRuntimeAudit(
        stubPage({
          status: 200,
          url: "https://app.example/guide",
          hasDocument: true,
        }),
        "https://app.example/guide",
      ),
    ).resolves.toBeUndefined();
  });

  it("survives a blocked motion-freeze style tag", async () => {
    await expect(
      gotoForRuntimeAudit(
        stubPage({
          status: 200,
          url: "https://app.example/guide",
          hasDocument: true,
          styleTagThrows: true,
        }),
        "https://app.example/guide",
      ),
    ).resolves.toBeUndefined();
  });

  it("fails closed on HTTP errors", async () => {
    await expect(
      gotoForRuntimeAudit(
        stubPage({ status: 404, url: "https://app.example/x", hasDocument: true }),
        "https://app.example/x",
      ),
    ).rejects.toThrow(/HTTP 404/);
    await expect(
      gotoForRuntimeAudit(
        stubPage({ status: 500, url: "https://app.example/x", hasDocument: true }),
        "https://app.example/x",
      ),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("fails closed on redirects away from the audited URL", async () => {
    await expect(
      gotoForRuntimeAudit(
        stubPage({
          status: 200,
          url: "https://app.example/login",
          hasDocument: true,
        }),
        "https://app.example/guide",
      ),
    ).rejects.toThrow(/redirected/);
  });

  it("fails closed on an empty document", async () => {
    await expect(
      gotoForRuntimeAudit(
        stubPage({
          status: 200,
          url: "https://app.example/guide",
          hasDocument: false,
        }),
        "https://app.example/guide",
      ),
    ).rejects.toThrow(/did not render/);
  });
});

describe("gotoForRuntimeAudit on a live page", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "audits a served route end to end",
    async () => {
      await withProbePage(
        `<!doctype html><html lang="en"><head><title>t</title></head><body><p>Live</p></body></html>`,
        async (page) => {
          await expect(
            gotoForRuntimeAudit(page, page.url()),
          ).resolves.toBeUndefined();
        },
        { routable: true },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

});
