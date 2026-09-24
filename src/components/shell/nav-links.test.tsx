import { describe, expect, it } from "vitest";

import { badgeAccessibleLabel } from "./nav-links";

describe("badgeAccessibleLabel", () => {
  it("includes the visible label text as a contiguous substring (WCAG 2.5.3)", () => {
    const name = badgeAccessibleLabel("Findings", 71, "openFindings");
    expect(name).toBe("Findings 71 open findings");
    // Visible text is "Findings 71" — it must appear verbatim in the name.
    expect(name).toContain("Findings 71");
  });

  it("handles singular counts and the alerts badge", () => {
    expect(badgeAccessibleLabel("Dashboard", 1, "unreadAlerts")).toBe(
      "Dashboard 1 unread alert",
    );
    expect(badgeAccessibleLabel("Findings", 1, "openFindings")).toContain(
      "Findings 1",
    );
  });
});
