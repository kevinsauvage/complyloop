import { describe, expect, it } from "vitest";

import { applyEditToText } from "./patch-apply";

const edit = (oldText: string, newText: string) => ({
  path: "Hero.tsx",
  oldText,
  newText,
});

describe("applyEditToText", () => {
  it("inserts the replacement literally", () => {
    // `String.replace` would expand `$&`/`$$`; committed text must match the
    // reviewed patch byte for byte.
    expect(
      applyEditToText(
        "export const Hero = () => <a />;",
        edit("<a />", '<a title="$& $1 $$" />'),
      ),
    ).toBe('export const Hero = () => <a title="$& $1 $$" />;');
  });

  it("fails when oldText is not present", () => {
    expect(() => applyEditToText("<a />", edit("<b />", "<c />"))).toThrow(
      /oldText not found/,
    );
  });

  it("fails when oldText is ambiguous", () => {
    expect(() => applyEditToText("<a /><a />", edit("<a />", "<b />"))).toThrow(
      /not unique.*\(2 matches\)/,
    );
  });
});
