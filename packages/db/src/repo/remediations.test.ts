import { describe, expect, it, vi } from "vitest";

import type { DrizzleDb } from "../postgres.ts";
import { listRemediationsForProject } from "./remediations.ts";

describe("listRemediationsForProject", () => {
  it("returns nothing for an empty status list instead of the full history", async () => {
    const select = vi.fn();
    const drizzle = { select } as unknown as DrizzleDb;

    expect(
      await listRemediationsForProject(drizzle, "project-1", {
        findingStatuses: [],
      }),
    ).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
