import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSecretBoxConfigured,
  lastFour,
  openSecret,
  sealSecret,
  SecretBoxError,
} from "./secret-box";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const AAD = "org-1";

function stubKey(key = ""): void {
  vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", key);
}

beforeEach(() => {
  stubKey(KEY_A);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secret box", () => {
  it("round-trips a secret with the org id as AAD", () => {
    const sealed = sealSecret("sk-ant-test", AAD);
    expect(sealed.ciphertext).not.toContain("sk-ant-test");
    expect(openSecret(sealed, AAD)).toBe("sk-ant-test");
  });

  it("fails authentication when the ciphertext is copied to another org", () => {
    const sealed = sealSecret("sk-ant-test", AAD);
    expect(() => openSecret(sealed, "org-2")).toThrow(SecretBoxError);
  });

  it("refuses a truncated authentication tag", () => {
    const sealed = sealSecret("sk-ant-test", AAD);
    const tag = Buffer.from(sealed.tag, "base64").subarray(0, 4);
    expect(() =>
      openSecret({ ...sealed, tag: tag.toString("base64") }, AAD),
    ).toThrow(SecretBoxError);
  });

  it("cannot open a row after the encryption key is rotated", () => {
    const sealed = sealSecret("sk-ant-test", AAD);
    stubKey(KEY_B);
    expect(() => openSecret(sealed, AAD)).toThrow(/authentication/);
  });

  it("reports an unconfigured deployment instead of throwing at import", () => {
    stubKey();
    expect(isSecretBoxConfigured()).toBe(false);
    expect(() => sealSecret("x", AAD)).toThrow(
      /AI_KEYS_ENCRYPTION_KEY is required/,
    );
  });

  it("rejects a key that is not 32 base64 bytes", () => {
    stubKey(Buffer.from("short").toString("base64"));
    expect(isSecretBoxConfigured()).toBe(false);
    expect(() => sealSecret("x", AAD)).toThrow(/32-byte key/);
  });

  it("exposes only the last four characters for display", () => {
    expect(lastFour("sk-ant-abcdef1234")).toBe("1234");
  });
});
