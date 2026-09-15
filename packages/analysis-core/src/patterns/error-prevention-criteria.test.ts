import { describe, expect, it } from "vitest";

import {
  ERROR_PREVENTION_CONFIRM_DATA_ATTRS,
  ERROR_PREVENTION_CONFIRM_DATASET_KEYS,
} from "./error-prevention-criteria";

/** data-foo-bar → fooBar (HTML dataset key derivation). */
function datasetKeyFromDataAttr(attr: string): string {
  const withoutData = attr.replace(/^data-/, "");
  return withoutData.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

describe("error-prevention confirm dataset keys", () => {
  it("round-trips data-* attribute names to HTMLElement.dataset keys", () => {
    expect(
      ERROR_PREVENTION_CONFIRM_DATA_ATTRS.map(datasetKeyFromDataAttr),
    ).toEqual([...ERROR_PREVENTION_CONFIRM_DATASET_KEYS]);
    expect(datasetKeyFromDataAttr("data-confirm")).toBe("confirm");
    expect(datasetKeyFromDataAttr("data-review-step")).toBe("reviewStep");
    expect(datasetKeyFromDataAttr("data-confirm-submit")).toBe("confirmSubmit");
  });
});
