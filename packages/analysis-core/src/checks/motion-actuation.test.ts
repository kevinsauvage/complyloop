import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { motionActuationCheck } from "./motion-actuation";

describe("motion-actuation", () => {
  it("flags a deviceorientation listener", () => {
    const findings = motionActuationCheck.run(
      parseSource(
        "test.tsx",
        `useEffect(() => window.addEventListener("deviceorientation", onTilt), []);`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(
      findings.every((finding) => finding.kind === "warning" && finding.confidence === "low"),
    ).toBe(true);
  });

  it("ignores unrelated listeners", () => {
    expect(
      motionActuationCheck.run(parseSource("test.tsx", `el.addEventListener("click", onClick);`)),
    ).toHaveLength(0);
  });
});
