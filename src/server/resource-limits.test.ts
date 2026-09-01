import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PublicError } from "@/core/public-error";
import { assertCheckoutWithinQuota } from "./resource-limits";

const envKeys = [
  "ASSESSMENT_MAX_CHECKOUT_BYTES",
  "ASSESSMENT_MAX_CHECKOUT_FILES",
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>;

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("assertCheckoutWithinQuota", () => {
  it("allows trees within the quota", () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "10";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = String(1024 * 1024);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-ok-"));
    try {
      fs.mkdirSync(path.join(root, "src"));
      fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
      fs.mkdirSync(path.join(root, ".git"));
      fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
      expect(() => assertCheckoutWithinQuota(root)).not.toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects when file count exceeds the quota", () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "1";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = String(1024 * 1024);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-files-"));
    try {
      fs.writeFileSync(path.join(root, "one.ts"), "1");
      fs.writeFileSync(path.join(root, "two.ts"), "2");
      expect(() => assertCheckoutWithinQuota(root)).toThrow(PublicError);
      expect(() => assertCheckoutWithinQuota(root)).toThrow(/assessment quota/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects when byte size exceeds the quota", () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "10";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = "8";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-bytes-"));
    try {
      fs.writeFileSync(path.join(root, "big.txt"), "0123456789");
      expect(() => assertCheckoutWithinQuota(root)).toThrow(/assessment quota/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
