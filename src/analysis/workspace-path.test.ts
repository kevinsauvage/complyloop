import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInside } from "./workspace-path";

describe("resolveInside", () => {
  const root = path.resolve("/tmp/complyloop-workspace");

  it("resolves a safe relative path under the root", () => {
    expect(resolveInside(root, "src/App.tsx")).toBe(
      path.join(root, "src", "App.tsx"),
    );
    expect(resolveInside(root, "./components/Button.tsx")).toBe(
      path.join(root, "components", "Button.tsx"),
    );
  });

  it("rejects path traversal outside the project root", () => {
    expect(() => resolveInside(root, "../../etc/passwd")).toThrow(
      /escapes project root/,
    );
    expect(() => resolveInside(root, "src/../../..")).toThrow(
      /escapes project root/,
    );
    expect(() =>
      resolveInside(root, path.join("..", "..", "outside.tsx")),
    ).toThrow(/escapes project root/);
  });

  it("rejects an absolute path that is outside the root", () => {
    expect(() => resolveInside(root, "/etc/passwd")).toThrow(
      /escapes project root/,
    );
  });
});
