import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { statusLiveCheck } from "./status-live";

describe("status-live", () => {
  it("warns on invalid field without live error region", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input aria-invalid="true" aria-label="Email" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts invalid field with alert role sibling", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div>
              <input aria-invalid="true" aria-label="Email" />
              <p role="alert">Required</p>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
