import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { imageDetailedDescriptionCheck } from "./image-detailed-description";

describe("image-detailed-description", () => {
  it("warns on chart-like images without a long description", () => {
    expect(
      imageDetailedDescriptionCheck.run(
        parseSource("test.tsx", `const A = () => <img src="/sales-chart.png" alt="Sales" />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts aria-describedby", () => {
    expect(
      imageDetailedDescriptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <img src="/chart.png" alt="Sales" aria-describedby="desc" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores decorative and simple images", () => {
    expect(
      imageDetailedDescriptionCheck.run(
        parseSource("test.tsx", `const A = () => <img src="/logo.png" alt="" />;`),
      ),
    ).toHaveLength(0);
  });
});
