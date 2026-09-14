import { describe, expect, it } from "vitest";

import { catalogControlIds } from "./catalog.ts";
import { rgaaControls } from "./rgaa/controls.ts";

describe("catalogControlIds", () => {
  it("returns catalog ids unchanged", () => {
    const id = rgaaControls[0]!.id;
    expect(catalogControlIds([id])).toEqual([id]);
  });

  it("throws when an id is not in the catalog", () => {
    expect(() => catalogControlIds(["ctl-does-not-exist"])).toThrow(
      /Unknown catalog control ids: ctl-does-not-exist/,
    );
  });
});
