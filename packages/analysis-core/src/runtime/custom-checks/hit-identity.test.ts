import { describe, expect, it } from "vitest";
import { hitIdentityKey } from "./hit-identity";

describe("hitIdentityKey", () => {
  it("joins id, role, and tag name with a JSON-safe separator", () => {
    const el = {
      id: "submit-btn",
      tagName: "BUTTON",
      getAttribute: (name: string) => (name === "role" ? "button" : null),
    };
    const key = hitIdentityKey(el);
    expect(key).toBe("submit-btn::button::BUTTON");
    // Must never contain control characters — this string is persisted as a
    // JSONB selector and Postgres rejects `\u0000` ("invalid Unicode escape").
    expect(key).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("still distinguishes elements with empty id and empty role", () => {
    const el = {
      id: "",
      tagName: "A",
      getAttribute: () => null,
    };
    expect(hitIdentityKey(el)).toBe("::::A");
  });

  it("distinguishes same tag+role by id", () => {
    const base = { tagName: "BUTTON", getAttribute: () => "button" };
    const first = hitIdentityKey({ ...base, id: "a" });
    const second = hitIdentityKey({ ...base, id: "b" });
    expect(first).not.toBe(second);
    expect(first).toBe("a::button::BUTTON");
    expect(second).toBe("b::button::BUTTON");
  });
});