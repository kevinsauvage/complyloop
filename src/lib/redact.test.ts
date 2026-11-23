import { describe, expect, it } from "vitest";

import { redactSecrets } from "./redact";

const SECRETS = [
  "sk-ant-api03-abcdefghijklmnop",
  "sk-proj-abcdefghijklmnopqrstuvwxyz",
  `AIza${"A".repeat(35)}`,
  "vck_abcdefghijklmnop",
];

describe("redactSecrets", () => {
  it.each(SECRETS)("masks an AI provider key (%s)", (secret) => {
    const redacted = redactSecrets(`key=${secret} trailing`);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("***");
  });

  it("masks every provider key embedded in a longer message", () => {
    const message = SECRETS.map((secret) => `token: ${secret}`).join(" ");
    const redacted = redactSecrets(message);
    for (const secret of SECRETS) expect(redacted).not.toContain(secret);
  });

  it("keeps ordinary error text intact", () => {
    expect(redactSecrets("provider returned 401 for model claude")).toBe(
      "provider returned 401 for model claude",
    );
  });

  it("still masks URL credentials and generic secret assignments", () => {
    expect(redactSecrets("postgres://user:pass@host/db")).toBe(
      "postgres://***@host/db",
    );
    expect(redactSecrets("api_key=plainvalue")).toBe("api_key=***");
  });
});
