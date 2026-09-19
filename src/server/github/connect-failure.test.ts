import { describe, expect, it } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { classifyConnectFailure } from "./connect-failure";

describe("classifyConnectFailure", () => {
  it.each([
    // github-app.ts
    [
      "No GitHub App installations found for your account. Install the App on the target repos first.",
      "no-installation",
    ],
    [
      "That GitHub App installation is not available on your account.",
      "no-installation",
    ],
    [
      "acme/shop is not available via your GitHub App installations. Install the App on that repository first.",
      "repo-not-on-install",
    ],
    [
      "acme/shop is not accessible via the selected GitHub App installation.",
      "repo-not-on-install",
    ],
    // connect.ts
    [
      "acme/shop is already connected. Disconnect it first.",
      "repo-not-on-install",
    ],
    [
      "GitHub revoked this app's authorization. Sign out and sign in again to reconnect.",
      "token-revoked",
    ],
    [
      "GitHub access token missing. Sign out and sign in again to grant repo access.",
      "token-missing",
    ],
    // github-access.ts
    ["Could not load repository acme/shop (404): Not Found", "repo-not-found"],
    // connect-project-panel.tsx
    [
      "Could not read your GitHub token. Sign out and sign in again.",
      "token-missing",
    ],
  ])("classifies %s as %s", (message, cause) => {
    expect(classifyConnectFailure(new PublicError(message))).toBe(cause);
  });

  it("returns unknown for unclassified and non-public errors", () => {
    expect(
      classifyConnectFailure(new PublicError("Something else broke.")),
    ).toBe("unknown");
    expect(
      classifyConnectFailure(new Error("No GitHub App installations")),
    ).toBe("unknown");
    expect(classifyConnectFailure(null)).toBe("unknown");
  });
});
