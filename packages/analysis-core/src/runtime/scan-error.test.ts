import { describe, expect, it } from "vitest";

import { PublicError } from "../contract/public-error";
import {
  classifyRuntimeScanError,
  RUNTIME_SCAN_FAILED_MESSAGE,
} from "./scan-error";
import { TOO_MANY_REDIRECTS_MESSAGE } from "./url-safety";

describe("classifyRuntimeScanError", () => {
  it("passes PublicError messages through", () => {
    expect(
      classifyRuntimeScanError(new PublicError("Preview URL is blocked.")),
    ).toBe("Preview URL is blocked.");
  });

  it("maps connection refused without leaking filesystem paths", () => {
    const message = classifyRuntimeScanError(
      new Error("page.goto: net::ERR_CONNECTION_REFUSED at /tmp/clone"),
    );
    expect(message).toMatch(/connection refused/i);
    expect(message).not.toContain("/tmp/clone");
    expect(message).not.toBe(RUNTIME_SCAN_FAILED_MESSAGE);
  });

  it("maps connection refused and appends origin+path without query tokens", () => {
    const message = classifyRuntimeScanError(
      new Error(
        "page.goto: net::ERR_CONNECTION_REFUSED at https://preview.example.com/app?token=secret",
      ),
    );
    expect(message).toContain("https://preview.example.com/app");
    expect(message).not.toContain("token=secret");
  });

  it("maps DNS failures", () => {
    expect(
      classifyRuntimeScanError(
        new Error(
          "page.goto: net::ERR_NAME_NOT_RESOLVED at https://missing.example/",
        ),
      ),
    ).toMatch(/resolve/i);
  });

  it("maps Playwright navigation timeouts", () => {
    const timeout = new Error(
      'page.goto: Timeout 30000ms exceeded.\nCall log:\n- navigating to "https://shop.example/", waiting until "networkidle"',
    );
    timeout.name = "TimeoutError";
    const message = classifyRuntimeScanError(timeout);
    expect(message).toMatch(/timed out/i);
    expect(message).toContain("https://shop.example");
    expect(message).not.toContain("networkidle");
  });

  it("maps TLS errors", () => {
    expect(
      classifyRuntimeScanError(
        new Error(
          "page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://bad-cert.example/",
        ),
      ),
    ).toMatch(/tls|ssl|certificate/i);
  });

  it("maps a missing Playwright browser without leaking the executable path", () => {
    const message = classifyRuntimeScanError(
      new Error(
        "browserType.launch: Executable doesn't exist at /Users/me/Library/Caches/ms-playwright/chromium-1194/chrome",
      ),
    );
    expect(message).toMatch(/browser/i);
    expect(message).not.toContain("/Users/me");
    expect(message).not.toContain("ms-playwright");
  });

  it("maps serverless Chromium (@sparticuz/chromium) failures the same way", () => {
    const message = classifyRuntimeScanError(
      new Error("sparticuz/chromium: incompatible architecture arm64"),
    );
    expect(message).toMatch(/browser/i);
    expect(message).not.toContain("arm64");
  });

  it("keeps unexpected errors generic and does not leak paths", () => {
    const message = classifyRuntimeScanError(
      new Error("ENOENT /secret/clone/axe.min.js"),
    );
    expect(message).toBe(RUNTIME_SCAN_FAILED_MESSAGE);
    expect(message).not.toContain("/secret");
  });

  it("maps too-many-redirects net errors to the public redirect message", () => {
    expect(
      classifyRuntimeScanError(
        new Error(
          "page.goto: net::ERR_TOO_MANY_REDIRECTS at https://app.example/",
        ),
      ),
    ).toBe(`${TOO_MANY_REDIRECTS_MESSAGE} (https://app.example)`);
  });
});
