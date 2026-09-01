import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { noAccesskeyCheck } from "./no-accesskey";

describe("no-accesskey", () => {
  it("flags accessKey and accesskey", () => {
    expect(
      noAccesskeyCheck.run(
        parseSource("test.tsx", `const A = () => <button accessKey="s">Save</button>;`),
      ),
    ).toHaveLength(1);
    expect(
      noAccesskeyCheck.run(
        parseSource("test.tsx", `const A = () => <a href="/" accesskey="h">Home</a>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores controls without accesskey", () => {
    expect(
      noAccesskeyCheck.run(parseSource("test.tsx", `const A = () => <button>Save</button>;`)),
    ).toHaveLength(0);
  });
});
