import { describe, expect, it, vi } from "vitest";

const dnsLookupMock = vi.hoisted(() =>
  vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
);

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: dnsLookupMock,
  },
}));

import {
  UNSAFE_RUNTIME_PORT_MESSAGE,
  UNSAFE_RUNTIME_URL_MESSAGE,
  allowRuntimeNavigation,
  assertSafeRuntimeBaseUrl,
  assertSafeRuntimeUrl,
  createRedirectHopGuard,
  TOO_MANY_REDIRECTS_MESSAGE,
  type DnsLookup,
} from "./url-safety";
import { scanRuntime } from "./scan";

const publicLookup: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

const privateLookup: DnsLookup = async () => [
  { address: "10.0.0.5", family: 4 },
];

const metadataLookup: DnsLookup = async () => [
  { address: "169.254.169.254", family: 4 },
];

const loopbackLookup: DnsLookup = async () => [
  { address: "127.0.0.1", family: 4 },
];

describe("assertSafeRuntimeBaseUrl", () => {
  it("accepts public https origins", () => {
    expect(assertSafeRuntimeBaseUrl("https://preview.example.com/app")).toBe(
      "https://preview.example.com",
    );
  });

  it("rejects localhost, private, metadata, and reserved hostnames", () => {
    const blocked = [
      "http://localhost:3000",
      "http://app.localhost",
      "http://printer.local",
      "http://svc.internal",
      "http://metadata.google.internal",
      "http://metadata",
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://192.168.1.1",
      "http://172.16.0.1",
      "http://169.254.169.254/latest",
      "http://100.64.0.1",
      "http://0.0.0.0",
      "http://[::1]",
      "http://[fd12:3456:789a::1]",
      "http://[fe80::1]",
      "http://[::ffff:127.0.0.1]",
      "http://[::ffff:10.1.2.3]",
    ];
    for (const url of blocked) {
      expect(() => assertSafeRuntimeBaseUrl(url), url).toThrow(
        UNSAFE_RUNTIME_URL_MESSAGE,
      );
    }
  });

  it("allows public IPv4 and IPv6 literals", () => {
    expect(assertSafeRuntimeBaseUrl("http://93.184.216.34")).toBe(
      "http://93.184.216.34",
    );
    expect(
      assertSafeRuntimeBaseUrl("http://[2606:2800:220:1:248:1893:25c8:1946]"),
    ).toBe("http://[2606:2800:220:1:248:1893:25c8:1946]");
  });

  it("rejects credentials and non-http schemes", () => {
    expect(() =>
      assertSafeRuntimeBaseUrl("https://user:pass@example.com"),
    ).toThrow(/credentials/);
    expect(() => assertSafeRuntimeBaseUrl("ftp://example.com")).toThrow(
      /http or https/,
    );
  });

  it("rejects unparseable URLs", () => {
    expect(() => assertSafeRuntimeBaseUrl("not a url")).toThrow(
      /valid http\(s\) preview URL/,
    );
  });

  it("rejects non-standard ports", () => {
    expect(() =>
      assertSafeRuntimeBaseUrl("https://preview.example.com:8443"),
    ).toThrow(UNSAFE_RUNTIME_PORT_MESSAGE);
    expect(() =>
      assertSafeRuntimeBaseUrl("http://preview.example.com:3000"),
    ).toThrow(UNSAFE_RUNTIME_PORT_MESSAGE);
  });

  it("allows default and standard ports", () => {
    expect(assertSafeRuntimeBaseUrl("https://preview.example.com:443")).toBe(
      "https://preview.example.com",
    );
    expect(assertSafeRuntimeBaseUrl("http://preview.example.com:80")).toBe(
      "http://preview.example.com",
    );
  });
});

describe("assertSafeRuntimeUrl", () => {
  it("accepts public domains that resolve to public IPs", async () => {
    await expect(
      assertSafeRuntimeUrl("https://preview.example.com/app", {
        lookup: publicLookup,
      }),
    ).resolves.toBe("https://preview.example.com/app");
  });

  it("rejects hostnames that resolve to private, metadata, or loopback IPs", async () => {
    await expect(
      assertSafeRuntimeUrl("https://evil.example.com", {
        lookup: privateLookup,
      }),
    ).rejects.toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
    await expect(
      assertSafeRuntimeUrl("https://metadata.example.com", {
        lookup: metadataLookup,
      }),
    ).rejects.toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
    await expect(
      assertSafeRuntimeUrl("https://loopback.example.com", {
        lookup: loopbackLookup,
      }),
    ).rejects.toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
  });

  it("rejects when any resolved address is private", async () => {
    const mixed: DnsLookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ];
    await expect(
      assertSafeRuntimeUrl("https://mixed.example.com", { lookup: mixed }),
    ).rejects.toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
  });

  it("fails closed when DNS lookup fails", async () => {
    const failing: DnsLookup = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      assertSafeRuntimeUrl("https://missing.example.com", { lookup: failing }),
    ).rejects.toThrow(/could not be resolved/);
  });

  it("fails closed when DNS returns no records", async () => {
    const empty: DnsLookup = async () => [];
    await expect(
      assertSafeRuntimeUrl("https://empty.example.com", { lookup: empty }),
    ).rejects.toThrow(/could not be resolved/);
  });

  it("accepts public IP literals without DNS lookup", async () => {
    const lookup = vi.fn(publicLookup);
    await expect(
      assertSafeRuntimeUrl("http://93.184.216.34/app", { lookup }),
    ).resolves.toBe("http://93.184.216.34/app");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("uses Node DNS when no lookup is injected", async () => {
    dnsLookupMock.mockClear();
    await expect(
      assertSafeRuntimeUrl("https://preview.example.com/app"),
    ).resolves.toBe("https://preview.example.com/app");
    expect(dnsLookupMock).toHaveBeenCalledWith("preview.example.com", {
      all: true,
    });
  });
});

describe("scanRuntime SSRF gate", () => {
  it("refuses scans when the base URL resolves to a private IP", async () => {
    const scanner = vi.fn(async () => []);
    const result = await scanRuntime({
      runtimeBaseUrl: "https://evil.example.com",
      runtimeRoutes: ["/"],
      scanner,
      lookup: privateLookup,
    });
    expect(result.error).toBe(UNSAFE_RUNTIME_URL_MESSAGE);
    expect(result.pagesScanned).toBe(0);
    expect(scanner).not.toHaveBeenCalled();
  });

  it("refuses scans when a route URL is a private literal", async () => {
    const scanner = vi.fn(async () => []);
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["http://127.0.0.1/admin"],
      scanner,
      lookup: publicLookup,
    });
    expect(result.error).toBe(UNSAFE_RUNTIME_URL_MESSAGE);
    expect(scanner).not.toHaveBeenCalled();
  });

  it("allows scans when DNS resolves to a public address", async () => {
    const scanner = vi.fn(async () => [
      { url: "https://preview.example.com/", violations: [] },
    ]);
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["/"],
      scanner,
      lookup: publicLookup,
    });
    expect(result.error).toBeUndefined();
    expect(result.pagesScanned).toBe(1);
    expect(scanner).toHaveBeenCalledOnce();
  });

  it("does not surface unexpected scanner errors", async () => {
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["/"],
      scanner: async () => {
        throw new Error("net::ERR_CONNECTION_REFUSED at /tmp/clone");
      },
      lookup: publicLookup,
    });
    expect(result.error).toBe("Runtime scan failed.");
    expect(result.error).not.toContain("/tmp/clone");
  });
});

describe("allowRuntimeNavigation", () => {
  it("denies private and metadata redirect targets", async () => {
    await expect(
      allowRuntimeNavigation("http://169.254.169.254/latest"),
    ).resolves.toEqual({
      ok: false,
      message: UNSAFE_RUNTIME_URL_MESSAGE,
    });
    await expect(
      allowRuntimeNavigation("http://10.0.0.8/admin"),
    ).resolves.toEqual({
      ok: false,
      message: UNSAFE_RUNTIME_URL_MESSAGE,
    });
    await expect(allowRuntimeNavigation("http://[::1]/")).resolves.toEqual({
      ok: false,
      message: UNSAFE_RUNTIME_URL_MESSAGE,
    });
  });

  it("denies redirect hostnames that resolve to private IPs", async () => {
    await expect(
      allowRuntimeNavigation("https://internal-redirect.example.com/path", {
        lookup: privateLookup,
      }),
    ).resolves.toEqual({
      ok: false,
      message: UNSAFE_RUNTIME_URL_MESSAGE,
    });
  });

  it("allows public redirect targets", async () => {
    await expect(
      allowRuntimeNavigation("https://preview.example.com/login", {
        lookup: publicLookup,
      }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("createRedirectHopGuard", () => {
  it("allows up to the max document hops then throws", () => {
    const guard = createRedirectHopGuard(2);
    guard.countHop("document");
    guard.countHop("script");
    guard.countHop("document");
    expect(guard.hops()).toBe(2);
    expect(() => guard.countHop("document")).toThrow(TOO_MANY_REDIRECTS_MESSAGE);
  });
});
