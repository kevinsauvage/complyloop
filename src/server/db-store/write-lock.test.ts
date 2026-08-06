import { describe, expect, it } from "vitest";
import { withProcessWriteLock } from "./write-lock";

describe("withProcessWriteLock", () => {
  it("serializes concurrent writers so the second sees the first's result", async () => {
    let value = 0;
    const first = withProcessWriteLock(async () => {
      const snapshot = value;
      await new Promise((resolve) => setTimeout(resolve, 20));
      value = snapshot + 1;
      return value;
    });
    const second = withProcessWriteLock(async () => {
      const snapshot = value;
      value = snapshot + 1;
      return value;
    });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(value).toBe(2);
  });
});
