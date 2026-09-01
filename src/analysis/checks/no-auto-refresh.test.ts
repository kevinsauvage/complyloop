import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { noAutoRefreshCheck } from "./no-auto-refresh";

describe("no-auto-refresh", () => {
  it("warns when setTimeout navigates the page", () => {
    const findings = noAutoRefreshCheck.run(
      parseSource(
        "test.tsx",
        `setTimeout(() => { window.location.href = "/next"; }, 5000);`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("warns when setInterval calls router.push", () => {
    const findings = noAutoRefreshCheck.run(
      parseSource(
        "test.tsx",
        `setInterval(() => router.push("/refresh"), 1000);`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("ignores timers without navigation", () => {
    expect(
      noAutoRefreshCheck.run(
        parseSource("test.tsx", `setTimeout(() => console.log("tick"), 1000);`),
      ),
    ).toHaveLength(0);
  });
});
