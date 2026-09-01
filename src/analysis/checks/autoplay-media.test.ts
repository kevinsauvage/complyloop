import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { autoplayMediaCheck } from "./autoplay-media";

describe("autoplay-media", () => {
  it("flags video with autoPlay and proposes removing the attribute", () => {
    const findings = autoplayMediaCheck.run(
      parseSource("test.tsx", `const A = () => <video src="/x.mp4" autoPlay />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({
      kind: "remove_attribute",
      attribute: "autoPlay",
    });
  });
});
