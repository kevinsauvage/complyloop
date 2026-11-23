import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OrgAiSettingsEventRow,
  OrgAiSettingsRow,
} from "@complyloop/db/repo/org-ai-settings";

import { initialActionState } from "@/core/actions/action-state";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
} from "@/test-fixtures/action-workspace-mocks";
import { testWorkspace } from "@/test-fixtures/workspace";

import { removeOrgAiConfigAction, saveOrgAiConfigAction } from "./org-ai";

const validateAiKey = vi.hoisted(() => vi.fn());
const assertAiRateLimit = vi.hoisted(() => vi.fn());
const assertAiOrgRateLimit = vi.hoisted(() => vi.fn());
const withOrgAiWrite = vi.hoisted(() => vi.fn());
const loadOrgAiSettings = vi.hoisted(() => vi.fn());
const decryptOrgAiKey = vi.hoisted(() => vi.fn());
const findOrgAiSettings = vi.hoisted(() => vi.fn());
const upsertOrgAiSettings = vi.hoisted(() => vi.fn());
const insertOrgAiSettingsEvent = vi.hoisted(() => vi.fn());
const deleteOrgAiSettings = vi.hoisted(() => vi.fn());

vi.mock("../ai/validate-key", () => ({
  validateAiKey: (...args: unknown[]) => validateAiKey(...args),
  aiKeyValidationMessage: (code: string) => `validation:${code}`,
}));

vi.mock("../ai/secret-box", () => ({
  isSecretBoxConfigured: () => true,
  lastFour: (value: string) => value.slice(-4),
  // Ciphertext deliberately never contains the plaintext: the assertion that
  // the key is absent is about the stored row, not this fake.
  sealSecret: (_plaintext: string, aad: string) => ({
    iv: "iv",
    tag: "tag",
    ciphertext: `sealed:${aad}`,
  }),
}));

vi.mock("../ai/ai-config", () => ({
  loadOrgAiSettings: (...args: unknown[]) => loadOrgAiSettings(...args),
  decryptOrgAiKey: (...args: unknown[]) => decryptOrgAiKey(...args),
}));

vi.mock("../ai/org-ai-write", () => ({
  withOrgAiWrite: (...args: unknown[]) => withOrgAiWrite(...args),
}));

vi.mock("@complyloop/db/repo/org-ai-settings", () => ({
  findOrgAiSettings: (...args: unknown[]) => findOrgAiSettings(...args),
  upsertOrgAiSettings: (...args: unknown[]) => upsertOrgAiSettings(...args),
  insertOrgAiSettingsEvent: (...args: unknown[]) =>
    insertOrgAiSettingsEvent(...args),
  deleteOrgAiSettings: (...args: unknown[]) => deleteOrgAiSettings(...args),
}));

vi.mock("../rate-limit", () => ({
  assertAiRateLimit: (...args: unknown[]) => assertAiRateLimit(...args),
  assertAiOrgRateLimit: (...args: unknown[]) => assertAiOrgRateLimit(...args),
}));

const stored: { row: OrgAiSettingsRow | undefined } = { row: undefined };
const written: OrgAiSettingsRow[] = [];
const events: OrgAiSettingsEventRow[] = [];

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("orgId", "org-1");
  data.set("model", "anthropic/claude-sonnet-5-5");
  data.set("apiKey", "vck_secret-key");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function existingRow(
  overrides: Partial<OrgAiSettingsRow> = {},
): OrgAiSettingsRow {
  return {
    orgId: "org-1",
    model: "anthropic/claude-sonnet-5-5",
    iv: "iv",
    tag: "tag",
    ciphertext: "sealed:org-1",
    keyLast4: "-key",
    updatedBy: "user-1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function asAdmin(): void {
  actionWorkspaceMocks.getWorkspace.mockResolvedValue(
    testWorkspace({ role: "admin" }),
  );
}

beforeEach(() => {
  stored.row = undefined;
  written.length = 0;
  events.length = 0;
  validateAiKey.mockResolvedValue("ok");
  assertAiRateLimit.mockResolvedValue(undefined);
  assertAiOrgRateLimit.mockResolvedValue(undefined);
  withOrgAiWrite.mockImplementation(
    async (
      _orgId: string,
      fn: (ctx: {
        tx: unknown;
        userId: string;
        actor: string;
      }) => Promise<unknown>,
    ) => fn({ tx: {}, userId: "user-1", actor: "user-1" }),
  );
  loadOrgAiSettings.mockImplementation(async () => stored.row);
  findOrgAiSettings.mockImplementation(async () => stored.row);
  decryptOrgAiKey.mockReturnValue("stored-secret-key");
  deleteOrgAiSettings.mockResolvedValue(undefined);
  upsertOrgAiSettings.mockImplementation(
    async (_tx: unknown, row: OrgAiSettingsRow) => {
      written.push(row);
      stored.row = row;
    },
  );
  insertOrgAiSettingsEvent.mockImplementation(
    async (_tx: unknown, event: OrgAiSettingsEventRow) => {
      events.push(event);
    },
  );
  actionAuthMocks.auth.mockResolvedValue({
    user: { id: "user-1", login: "user-1" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  actionAuthMocks.auth.mockReset();
});

describe("saveOrgAiConfigAction", () => {
  it("rejects members without org.manage_ai", async () => {
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(
      testWorkspace({ role: "member" }),
    );

    const result = await saveOrgAiConfigAction(initialActionState, form());

    expect(result.ok ? null : result.message).toMatch(/org\.manage_ai/);
    expect(validateAiKey).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  it("stores a sealed row and an audit event without the key", async () => {
    asAdmin();

    const result = await saveOrgAiConfigAction(initialActionState, form());

    expect(result.ok).toBe(true);
    expect(validateAiKey).toHaveBeenCalledWith(
      "vck_secret-key",
      "anthropic/claude-sonnet-5-5",
    );
    expect(written[0]).toEqual({
      orgId: "org-1",
      model: "anthropic/claude-sonnet-5-5",
      iv: "iv",
      tag: "tag",
      // Sealed with the org id as authenticated data.
      ciphertext: "sealed:org-1",
      keyLast4: "-key",
      updatedBy: "user-1",
      updatedAt: expect.any(String),
    });
    expect(events[0]).toMatchObject({
      action: "configured",
      model: "anthropic/claude-sonnet-5-5",
      actor: "user-1",
    });
    expect(JSON.stringify([written, events])).not.toContain("vck_secret-key");
  });

  it("refuses an oversized key before contacting the gateway", async () => {
    asAdmin();

    const result = await saveOrgAiConfigAction(
      initialActionState,
      form({ apiKey: "k".repeat(513) }),
    );

    expect(result.ok ? null : result.message).toMatch(/too long/);
    expect(validateAiKey).not.toHaveBeenCalled();
  });

  it("keeps the stored key on a model-only change", async () => {
    stored.row = existingRow();
    asAdmin();

    const data = form({ model: "openai/gpt-5" });
    data.delete("apiKey");
    const result = await saveOrgAiConfigAction(initialActionState, data);

    expect(result.ok).toBe(true);
    expect(validateAiKey).toHaveBeenCalledWith(
      "stored-secret-key",
      "openai/gpt-5",
    );
    expect(written[0]?.model).toBe("openai/gpt-5");
  });

  it("asks for a key when none is stored", async () => {
    asAdmin();

    const data = form();
    data.delete("apiKey");
    const result = await saveOrgAiConfigAction(initialActionState, data);

    expect(result.ok ? null : result.message).toMatch(/Enter your AI Gateway/);
    expect(validateAiKey).not.toHaveBeenCalled();
  });

  it("refuses a model-only change when another admin rotated the key", async () => {
    const before = existingRow();
    stored.row = before;
    loadOrgAiSettings.mockResolvedValue(before);
    findOrgAiSettings.mockResolvedValue(
      existingRow({ ciphertext: "sealed:rotated" }),
    );
    asAdmin();

    const data = form();
    data.delete("apiKey");
    const result = await saveOrgAiConfigAction(initialActionState, data);

    expect(result.ok ? null : result.message).toMatch(/key changed/);
    expect(written).toHaveLength(0);
  });

  it("rejects an invalid key and never writes", async () => {
    validateAiKey.mockResolvedValue("auth_failed");
    asAdmin();

    const result = await saveOrgAiConfigAction(initialActionState, form());

    expect(result.ok ? null : result.message).toBe("validation:auth_failed");
    expect(written).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

describe("removeOrgAiConfigAction", () => {
  function orgForm(): FormData {
    const data = new FormData();
    data.set("orgId", "org-1");
    return data;
  }

  it("removes the configuration and keeps the audit trail", async () => {
    stored.row = existingRow();
    asAdmin();

    const result = await removeOrgAiConfigAction(initialActionState, orgForm());

    expect(result.ok).toBe(true);
    expect(deleteOrgAiSettings).toHaveBeenCalledWith({}, "org-1");
    expect(events[0]).toMatchObject({
      action: "removed",
      model: "anthropic/claude-sonnet-5-5",
      actor: "user-1",
    });
  });

  it("refuses when nothing is stored", async () => {
    asAdmin();

    const result = await removeOrgAiConfigAction(initialActionState, orgForm());

    expect(result.ok ? null : result.message).toMatch(/No AI configuration/);
    expect(deleteOrgAiSettings).not.toHaveBeenCalled();
  });
});
