import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiStatus } from "@/server/ai/types";

import { OrgAiSettingsCard } from "./org-ai-settings-card";

vi.mock("@/server/actions/org-ai", () => ({
  saveOrgAiConfigAction: vi.fn(),
  removeOrgAiConfigAction: vi.fn(),
}));

function status(overrides: Partial<AiStatus> = {}): AiStatus {
  return {
    available: true,
    reason: null,
    source: "org",
    model: "anthropic/claude-sonnet-5-5",
    keyLast4: "abcd",
    updatedAt: "2026-11-01T10:00:00.000Z",
    updatedBy: "alice",
    encryptionConfigured: true,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("OrgAiSettingsCard", () => {
  it("shows the model and masked key without editing controls to viewers", () => {
    render(
      <OrgAiSettingsCard
        orgId="org-1"
        canManage={false}
        status={status()}
        recentChanges={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByText("Your organization's key")).toBeInTheDocument();
    expect(screen.getByText(/••••abcd/)).toBeInTheDocument();
    expect(
      screen.getByText("anthropic/claude-sonnet-5-5", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save AI settings" }),
    ).not.toBeInTheDocument();
  });

  it("gives admins labelled key and model fields and a remove control", () => {
    render(
      <OrgAiSettingsCard
        orgId="org-1"
        canManage
        status={status()}
        recentChanges={[]}
      />,
    );

    const key = screen.getByLabelText("Vercel AI Gateway API key");
    expect(key).toHaveProperty("type", "password");
    expect(key).toHaveValue("");
    expect(key).not.toBeRequired();
    expect(screen.getByLabelText("Model")).toHaveValue(
      "anthropic/claude-sonnet-5-5",
    );
    expect(
      screen.getByRole("button", { name: "Save AI settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove AI key" }),
    ).toBeInTheDocument();
  });

  it("requires a key and offers no removal when the org has none", () => {
    render(
      <OrgAiSettingsCard
        orgId="org-1"
        canManage
        status={status({
          available: false,
          reason: "not_configured",
          source: null,
          model: null,
          keyLast4: null,
          updatedAt: null,
          updatedBy: null,
        })}
        recentChanges={[]}
      />,
    );

    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByLabelText("Vercel AI Gateway API key")).toBeRequired();
    expect(
      screen.queryByRole("button", { name: "Remove AI key" }),
    ).not.toBeInTheDocument();
  });

  it("reports platform AI when no org key is configured", () => {
    render(
      <OrgAiSettingsCard
        orgId="org-1"
        canManage={false}
        status={status({ source: "platform", keyLast4: null })}
        recentChanges={[]}
      />,
    );
    expect(screen.getByText("Platform AI")).toBeInTheDocument();
    expect(
      screen.getByText(/operator's AI gateway is used/i),
    ).toBeInTheDocument();
  });

  it("hides the editor when the deployment cannot store keys", () => {
    render(
      <OrgAiSettingsCard
        orgId="org-1"
        canManage
        status={status({
          available: false,
          reason: "encryption_unavailable",
          encryptionConfigured: false,
        })}
        recentChanges={[]}
      />,
    );
    expect(
      screen.getByText(/Bring-your-own-key is unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save AI settings" }),
    ).not.toBeInTheDocument();
  });
});
