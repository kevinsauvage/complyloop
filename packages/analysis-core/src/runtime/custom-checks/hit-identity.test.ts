import { describe, expect, it } from "vitest";
import { hitIdentityKey } from "./hit-identity";

describe("hitIdentityKey", () => {
  it("joins id, role, and tag name with a JSON-safe separator", () => {
    const el = {
      id: "submit-btn",
      tagName: "BUTTON",
      getAttribute: (name: string) => (name === "role" ? "button" : null),
    } as unknown as HTMLElement;
    const key = hitIdentityKey(el);
    // When id is present, key uses CSS id selector format: #id::role::tagName
    expect(key).toBe("#submit-btn::button::BUTTON");
    // Must never contain control characters — this string is persisted as a
    // JSONB selector and Postgres rejects `\u0000` ("invalid Unicode escape").
    expect(key).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("distinguishes same tag+role by id", () => {
    const base = { tagName: "BUTTON" as const, getAttribute: () => "button" };
    const first = hitIdentityKey({ ...base, id: "a" } as unknown as HTMLElement);
    const second = hitIdentityKey({ ...base, id: "b" } as unknown as HTMLElement);
    expect(first).not.toBe(second);
    expect(first).toBe("#a::button::BUTTON");
    expect(second).toBe("#b::button::BUTTON");
  });

  it("elements with empty id and empty role get a key with positioning path", () => {
    const el = {
      id: "",
      tagName: "A" as const,
      getAttribute: () => null,
    } as unknown as HTMLElement;
    const key = hitIdentityKey(el);
    // Should not be the old "::::A" since we now include a positioning path
    expect(key).not.toBe("::::A");
    // Must not contain control characters
    expect(key).not.toMatch(/[\u0000-\u001f\u007f]/);
    // Should have the format: <path>::<role-or-empty>::<tag>
    expect(key).toMatch(/^.+::.*::.+$/);
    // When no id, the path should include positioning info (may be empty string path)
    expect(key).toContain("::");
  });

  it("distinguishes same tag+role by id (with string tagName)", () => {
    const base = { tagName: "BUTTON", getAttribute: () => "button" };
    const first = hitIdentityKey({ ...base, id: "a" } as unknown as HTMLElement);
    const second = hitIdentityKey({ ...base, id: "b" } as unknown as HTMLElement);
    expect(first).not.toBe(second);
    expect(first).toBe("#a::button::BUTTON");
    expect(second).toBe("#b::button::BUTTON");
  });
});