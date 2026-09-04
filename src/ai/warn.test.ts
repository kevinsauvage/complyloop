import { describe, expect, it, vi } from "vitest";
import { aiWarn, setAiWarn } from "./warn";

describe("aiWarn", () => {
  it("forwards the message and context to the configured sink", () => {
    const sink = vi.fn();
    setAiWarn(sink);

    aiWarn("model fallback", { model: "mini" });

    expect(sink).toHaveBeenCalledWith("model fallback", { model: "mini" });
  });

  it("defaults to a no-op before a sink is wired", () => {
    // Reset to a no-op and confirm that warning does not throw.
    setAiWarn(() => {});
    expect(() => aiWarn("quiet")).not.toThrow();
    expect(() => aiWarn("quiet", { a: 1 })).not.toThrow();
  });
});