import { describe, expect, it } from "vitest";

import {
  axeCorePackageVersion,
  htmlValidatePackageVersion,
} from "./analyzer-versions";

describe("analyzer-versions", () => {
  it("reads installed analyzer package versions", () => {
    expect(axeCorePackageVersion()).toMatch(/^\d+\./);
    expect(htmlValidatePackageVersion()).toMatch(/^\d+\./);
  });
});
