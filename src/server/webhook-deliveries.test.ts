import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimWebhookDelivery,
  hasProcessedWebhookDelivery,
} from "./webhook-deliveries";

let dataDir: string;
const previousDataDir = process.env.DATA_DIR;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-del-"));
  process.env.DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
});

describe("webhook delivery idempotency", () => {
  it("claims a delivery once and rejects duplicates", async () => {
    expect(await claimWebhookDelivery("del-1")).toBe(true);
    expect(await hasProcessedWebhookDelivery("del-1")).toBe(true);
    expect(await claimWebhookDelivery("del-1")).toBe(false);
    expect(await claimWebhookDelivery("del-2")).toBe(true);
  });

  it("allows concurrent claimants for the same id to produce one winner", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimWebhookDelivery("concurrent-1")),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await hasProcessedWebhookDelivery("concurrent-1")).toBe(true);
  });

  it("cannot dedupe empty delivery ids", async () => {
    expect(await claimWebhookDelivery("")).toBe(true);
    expect(await claimWebhookDelivery("")).toBe(true);
    expect(await hasProcessedWebhookDelivery("")).toBe(false);
  });
});
