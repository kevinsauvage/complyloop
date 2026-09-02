import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { headingOrderCheck } from "./heading-order";

describe("heading-order", () => {
  it("flags skipped heading levels", () => {
    const findings = headingOrderCheck.run(
      parseSource("test.tsx", `const A = () => (<div><h1>Title</h1><h3>Skip</h3></div>);`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("heading-order");
  });
});
