import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgAiSettingsRow } from "@complyloop/db/repo/org-ai-settings";

import { AI_UNAVAILABLE_MESSAGE } from "@/ai/ai-call";

import { sealSecret } from "./secret-box";

const findOrgAiSettings = vi.hoisted(() => vi.fn());
const listOrgAiSettingsEvents = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const createGateway = vi.hoisted(() =>
  vi.fn((options: { apiKey: string }) => (modelId: string) => ({
    apiKey: options.apiKey,
    modelId,
  })),
);

vi.mock("ai", () => ({ createGateway }));

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({}),
}));

vi.mock("@complyloop/db/repo/org-ai-settings", () => ({
  findOrgAiSettings: (...args: unknown[]) => findOrgAiSettings(...args),
  listOrgAiSettingsEvents: (...args: unknown[]) =>
    listOrgAiSettingsEvents(...args),
}));

vi.mock("../observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const KEY = randomBytes(32).toString("base64");
const ORG_ID = "org-1";

function storedRow(
  overrides: Partial<OrgAiSettingsRow> = {},
): OrgAiSettingsRow {
  return {
    orgId: ORG_ID,
    model: "anthropic/claude-sonnet-5-5",
    ...sealSecret("vck_stored", ORG_ID),
    keyLast4: "ored",
    updatedBy: "alice",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

async function loadModule() {
  return import("./ai-config");
}

beforeEach(() => {
  vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", KEY);
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("AI_MODEL", "");
  findOrgAiSettings.mockResolvedValue(undefined);
  listOrgAiSettingsEvents.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("prepareAiCallForOrg", () => {
  it("uses the operator gateway when the org has no key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "operator-key");
    vi.stubEnv("AI_MODEL", "acme/zdr-model");
    const { prepareAiCallForOrg } = await loadModule();

    await expect(prepareAiCallForOrg(ORG_ID)).resolves.toEqual({
      model: { apiKey: "operator-key", modelId: "acme/zdr-model" },
      modelId: "acme/zdr-model",
    });
  });

  it("is unavailable when neither the org nor the operator has a key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "operator-key");
    const { prepareAiCallForOrg } = await loadModule();

    await expect(prepareAiCallForOrg(ORG_ID)).rejects.toThrow(
      AI_UNAVAILABLE_MESSAGE,
    );
    await expect(prepareAiCallForOrg(ORG_ID, "No patch.")).rejects.toThrow(
      "No patch.",
    );
  });

  it("prefers the org key over the operator's", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "operator-key");
    vi.stubEnv("AI_MODEL", "acme/zdr-model");
    findOrgAiSettings.mockResolvedValue(storedRow());
    const { prepareAiCallForOrg } = await loadModule();

    await expect(prepareAiCallForOrg(ORG_ID)).resolves.toEqual({
      model: { apiKey: "vck_stored", modelId: "anthropic/claude-sonnet-5-5" },
      modelId: "anthropic/claude-sonnet-5-5",
    });
  });

  it("refuses an unreadable org key instead of falling back to the operator", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "operator-key");
    vi.stubEnv("AI_MODEL", "acme/zdr-model");
    findOrgAiSettings.mockResolvedValue(storedRow({ orgId: "org-2" }));
    const { prepareAiCallForOrg } = await loadModule();

    await expect(prepareAiCallForOrg(ORG_ID)).rejects.toThrow(/can't be read/);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: "ai_key_unreadable" }),
    );
  });
});

describe("aiStatusForOrg", () => {
  it("reports an org key without decrypting it", async () => {
    findOrgAiSettings.mockResolvedValue(storedRow());
    const { aiStatusForOrg } = await loadModule();

    await expect(aiStatusForOrg(ORG_ID)).resolves.toEqual({
      available: true,
      reason: null,
      source: "org",
      model: "anthropic/claude-sonnet-5-5",
      keyLast4: "ored",
      updatedAt: "2026-11-01T00:00:00.000Z",
      updatedBy: "alice",
      encryptionConfigured: true,
    });
    expect(createGateway).not.toHaveBeenCalled();
  });

  it("flags an org key the deployment cannot read", async () => {
    findOrgAiSettings.mockResolvedValue(storedRow());
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", "");
    const { aiStatusForOrg } = await loadModule();

    await expect(aiStatusForOrg(ORG_ID)).resolves.toMatchObject({
      available: false,
      reason: "encryption_unavailable",
      source: "org",
    });
  });

  it("reports the platform source and the unconfigured state", async () => {
    const { aiStatusForOrg } = await loadModule();
    await expect(aiStatusForOrg(ORG_ID)).resolves.toMatchObject({
      available: false,
      reason: "not_configured",
      source: null,
    });

    vi.stubEnv("AI_GATEWAY_API_KEY", "operator-key");
    vi.stubEnv("AI_MODEL", "acme/zdr-model");
    await expect(aiStatusForOrg(ORG_ID)).resolves.toMatchObject({
      available: true,
      reason: null,
      source: "platform",
      model: "acme/zdr-model",
    });
  });
});

describe("loadOrgAiSettingsView", () => {
  it("withholds key details and history from read-only roles", async () => {
    findOrgAiSettings.mockResolvedValue(storedRow());
    const { loadOrgAiSettingsView } = await loadModule();

    const view = await loadOrgAiSettingsView(ORG_ID, false);
    expect(view.status).toMatchObject({
      available: true,
      model: "anthropic/claude-sonnet-5-5",
      keyLast4: null,
      updatedBy: null,
    });
    expect(view.recentChanges).toEqual([]);
    expect(listOrgAiSettingsEvents).not.toHaveBeenCalled();
  });

  it("shows key details and history to managers", async () => {
    findOrgAiSettings.mockResolvedValue(storedRow());
    const event = {
      id: "e1",
      orgId: ORG_ID,
      at: "2026-11-01T00:00:00.000Z",
      actor: "alice",
      action: "configured",
      model: "anthropic/claude-sonnet-5-5",
    };
    listOrgAiSettingsEvents.mockResolvedValue([event]);
    const { loadOrgAiSettingsView } = await loadModule();

    const view = await loadOrgAiSettingsView(ORG_ID, true);
    expect(view.status.keyLast4).toBe("ored");
    expect(view.recentChanges).toEqual([event]);
  });
});

describe("loadOrgAiExport", () => {
  it("exports routing metadata but never the envelope", async () => {
    findOrgAiSettings.mockResolvedValue(storedRow());
    const { loadOrgAiExport } = await loadModule();

    const exported = await loadOrgAiExport(ORG_ID);
    expect(exported.configuration).toEqual({
      model: "anthropic/claude-sonnet-5-5",
      keyLast4: "ored",
      updatedAt: "2026-11-01T00:00:00.000Z",
      updatedBy: "alice",
    });
    const json = JSON.stringify(exported);
    expect(json).not.toContain("ciphertext");
    expect(json).not.toContain("vck_stored");
  });
});
