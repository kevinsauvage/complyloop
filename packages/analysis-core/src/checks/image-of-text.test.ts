import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { imageOfTextCheck } from "./image-of-text";

describe("image-of-text", () => {
  it("flags a background-image that may render text", () => {
    expect(
      imageOfTextCheck.run(
        parseSource("test.tsx", `const A = () => <div style={{ backgroundImage: "url(a.png)" }} />;`),
      ),
    ).toHaveLength(1);
  });

  it("flags role=img containing text", () => {
    expect(
      imageOfTextCheck.run(
        parseSource("test.tsx", `const A = () => <span role="img">Sale</span>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores real text", () => {
    expect(
      imageOfTextCheck.run(parseSource("test.tsx", `const A = () => <p>Sale</p>;`)),
    ).toHaveLength(0);
  });
});
