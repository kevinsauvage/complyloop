import { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestOrigin } from "./request-origin";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

function withHeaders(entries: Record<string, string>): void {
  vi.mocked(headers).mockResolvedValue(new Headers(entries));
}

beforeEach(() => {
  vi.mocked(headers).mockReset();
});

describe("requestOrigin", () => {
  it("prefers the forwarded host and proto behind the proxy", async () => {
    withHeaders({
      host: "internal:3000",
      "x-forwarded-host": "app.example",
      "x-forwarded-proto": "https",
    });

    await expect(requestOrigin()).resolves.toBe("https://app.example");
  });

  it("takes the first entry of a proxy header list", async () => {
    withHeaders({
      "x-forwarded-host": " app.example , edge.internal ",
      "x-forwarded-proto": "https, http",
    });

    await expect(requestOrigin()).resolves.toBe("https://app.example");
  });

  it("falls back to the Host header", async () => {
    withHeaders({ host: "app.example" });

    await expect(requestOrigin()).resolves.toBe("https://app.example");
  });

  it("infers http for a local host with a port", async () => {
    withHeaders({ host: "localhost:3000" });

    await expect(requestOrigin()).resolves.toBe("http://localhost:3000");
  });

  it("infers http for the loopback address", async () => {
    withHeaders({ host: "127.0.0.1" });

    await expect(requestOrigin()).resolves.toBe("http://127.0.0.1");
  });

  it("infers https for any other host", async () => {
    withHeaders({ host: "complyloop.example" });

    await expect(requestOrigin()).resolves.toBe("https://complyloop.example");
  });

  it("defaults to the dev origin when no host header is present", async () => {
    withHeaders({});

    await expect(requestOrigin()).resolves.toBe("http://localhost:3000");
  });
});
