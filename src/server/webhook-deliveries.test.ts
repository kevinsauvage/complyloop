import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasProcessedWebhookDelivery,
  recordWebhookDelivery,
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
  it("records and detects duplicate delivery ids", async () => {
    expect(await hasProcessedWebhookDelivery("del-1")).toBe(false);
    await recordWebhookDelivery("del-1");
    expect(await hasProcessedWebhookDelivery("del-1")).toBe(true);
    expect(await hasProcessedWebhookDelivery("del-2")).toBe(false);
  });
});
