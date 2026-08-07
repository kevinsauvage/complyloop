import { describe, expect, it } from "vitest";
import { assertSafeRuntimeBaseUrl } from "./runtime-url";

describe("assertSafeRuntimeBaseUrl", () => {
  it("accepts public https origins", () => {
    expect(assertSafeRuntimeBaseUrl("https://preview.example.com/app")).toBe(
      "https://preview.example.com",
    );
  });

  it("rejects localhost and private IPs", () => {
    expect(() => assertSafeRuntimeBaseUrl("http://localhost:3000")).toThrow(
      /localhost|private|metadata/,
    );
    expect(() => assertSafeRuntimeBaseUrl("http://127.0.0.1")).toThrow(
      /localhost|private|metadata/,
    );
    expect(() => assertSafeRuntimeBaseUrl("http://10.0.0.5")).toThrow(
      /localhost|private|metadata/,
    );
    expect(() => assertSafeRuntimeBaseUrl("http://192.168.1.1")).toThrow(
      /localhost|private|metadata/,
    );
    expect(() =>
      assertSafeRuntimeBaseUrl("http://169.254.169.254/latest"),
    ).toThrow(/localhost|private|metadata/);
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
