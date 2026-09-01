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
});
