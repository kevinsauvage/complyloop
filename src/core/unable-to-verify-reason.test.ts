import { describe, expect, it } from "vitest";
import {
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "./unable-to-verify-reason";

describe("unableToVerifyReason", () => {
  it("flags missing preview URL for runtime-only checks", () => {
    expect(
      unableToVerifyReason(
        { checkId: "color-contrast" },
        {},
        { isRuntimeOnlyCheck: true },
      ),
    ).toBe("needs_preview_url");
  });

  it("flags human-only controls", () => {
    expect(
      unableToVerifyReason(
        { checkId: null },
        { runtimeBaseUrl: "https://app.example.com" },
        { isRuntimeOnlyCheck: false },
      ),
    ).toBe("needs_human_review");
  });

  it("labels reasons in engineer language", () => {
    expect(unableToVerifyReasonLabel("needs_preview_url")).toMatch(/preview URL/i);
    expect(unableToVerifyReasonLabel("needs_human_review")).toMatch(/human review/i);
    expect(unableToVerifyReasonLabel("needs_pertinence_review")).toMatch(
      /Presence checked/i,
    );
    expect(unableToVerifyReasonLabel("needs_heuristic_review")).toMatch(
      /not a pass/i,
    );
  });

  it("uses pertinence copy for presence/pertinence twins", () => {
    expect(
      unableToVerifyReason(
        { checkId: null },
        {},
        { isRuntimeOnlyCheck: false, isPertinenceTwin: true },
      ),
    ).toBe("needs_pertinence_review");
  });

  it("uses heuristic copy when no suspicious pattern was found", () => {
    expect(
      unableToVerifyReason(
        { checkId: "image-of-text" },
        {},
        { isRuntimeOnlyCheck: false, isHeuristicCheck: true },
      ),
    ).toBe("needs_heuristic_review");
  });

  it("returns runtime_only_pending when a runtime-only check had a reachable preview", () => {
    expect(
      unableToVerifyReason(
        { checkId: "color-contrast" },
        { runtimeBaseUrl: "https://app.example.com" },
        { isRuntimeOnlyCheck: true },
      ),
    ).toBe("runtime_only_pending");
  });

  it("returns non_scorable for a scorable check with no preview and no runtime requirement", () => {
    expect(
      unableToVerifyReason(
        { checkId: "duplicate-id" },
        {},
        { isRuntimeOnlyCheck: false },
      ),
    ).toBe("non_scorable");
  });

  it("labels every reason without throw", () => {
    const reasons = [
      "needs_preview_url",
      "needs_human_review",
      "needs_pertinence_review",
      "needs_heuristic_review",
      "runtime_only_pending",
      "non_scorable",
    ] as const;
    for (const reason of reasons) {
      expect(unableToVerifyReasonLabel(reason).length).toBeGreaterThan(0);
    }
    expect(unableToVerifyReasonLabel("non_scorable")).toMatch(/review|exception/i);
  });

  it("throws on an unhandled reason", () => {
    expect(() =>
      unableToVerifyReasonLabel("bogus" as never),
    ).toThrow(/Unhandled unable-to-verify reason/);
  });
});
