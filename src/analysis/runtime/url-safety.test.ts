import { describe, expect, it, vi } from "vitest";
import {
  UNSAFE_RUNTIME_URL_MESSAGE,
  allowRuntimeNavigation,
  assertSafeRuntimeBaseUrl,
  assertSafeRuntimeUrl,
  isBlockedHostname,
  isBlockedIpAddress,
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

describe("isBlockedIpAddress", () => {
  it("blocks private IPv4, loopback, link-local, and CGNAT", () => {
    expect(isBlockedIpAddress("10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.1")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("0.0.0.0")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isBlockedIpAddress("93.184.216.34")).toBe(false);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
  });

  it("blocks loopback, ULA, link-local, and IPv4-mapped IPv6", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fd12:3456:789a::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.1.2.3")).toBe(true);
  });

  it("allows public IPv6", () => {
    expect(isBlockedIpAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(
      false,
    );
  });
});

describe("isBlockedHostname", () => {
  it("blocks localhost, metadata, and special suffixes", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("app.localhost")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("svc.internal")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("metadata")).toBe(true);
  });

  it("allows ordinary public hostnames", () => {
    expect(isBlockedHostname("preview.example.com")).toBe(false);
  });
});

describe("assertSafeRuntimeBaseUrl", () => {
  it("accepts public https origins", () => {
    expect(assertSafeRuntimeBaseUrl("https://preview.example.com/app")).toBe(
      "https://preview.example.com",
    );
  });

  it("rejects localhost and private IP literals", () => {
    expect(() => assertSafeRuntimeBaseUrl("http://localhost:3000")).toThrow(
      UNSAFE_RUNTIME_URL_MESSAGE,
    );
    expect(() => assertSafeRuntimeBaseUrl("http://127.0.0.1")).toThrow(
      UNSAFE_RUNTIME_URL_MESSAGE,
    );
    expect(() => assertSafeRuntimeBaseUrl("http://10.0.0.5")).toThrow(
      UNSAFE_RUNTIME_URL_MESSAGE,
    );
    expect(() => assertSafeRuntimeBaseUrl("http://192.168.1.1")).toThrow(
      UNSAFE_RUNTIME_URL_MESSAGE,
    );
    expect(() =>
      assertSafeRuntimeBaseUrl("http://169.254.169.254/latest"),
    ).toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
    expect(() => assertSafeRuntimeBaseUrl("http://[::1]/")).toThrow(
      UNSAFE_RUNTIME_URL_MESSAGE,
    );
  });

  it("rejects credentials and non-http schemes", () => {
    expect(() =>
      assertSafeRuntimeBaseUrl("https://user:pass@example.com"),
    ).toThrow(/credentials/);
    expect(() => assertSafeRuntimeBaseUrl("ftp://example.com")).toThrow(
      /http or https/,
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

  it("rejects hostnames that resolve to private IPs", async () => {
    await expect(
      assertSafeRuntimeUrl("https://evil.example.com", {
        lookup: privateLookup,
      }),
    ).rejects.toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
  });

  it("rejects hostnames that resolve to metadata addresses", async () => {
    await expect(
      assertSafeRuntimeUrl("https://metadata.example.com", {
        lookup: metadataLookup,
      }),
    ).rejects.toThrow(UNSAFE_RUNTIME_URL_MESSAGE);
  });

  it("rejects hostnames that resolve to loopback", async () => {
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
});

describe("allowRuntimeNavigation (redirect hops)", () => {
  it("denies private and metadata redirect targets with a user-safe message", async () => {
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
    await expect(
      allowRuntimeNavigation("http://[::1]/"),
    ).resolves.toEqual({
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
