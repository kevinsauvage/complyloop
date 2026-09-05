import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDrizzle, getDrizzle } from "@complyloop/db/client";
import { findings } from "@complyloop/db/schema";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
} from "@complyloop/db/test-fixtures/project-slice-fixture";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const readActiveProjectCookie = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
  readActiveProjectCookie,
}));

import { withTargetedProjectWrite } from "./workspace";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("withTargetedProjectWrite postgres integration", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a finding mutation through the real write transaction", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-workspace`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    auth.mockResolvedValue({
      user: { id: fixture.userId, login: fixture.githubLogin },
    });
    readActiveOrgCookie.mockResolvedValue(fixture.orgId);
    readActiveProjectCookie.mockResolvedValue(fixture.projectId);

    try {
      await withTargetedProjectWrite(
        { findingIds: [fixture.findingOneId] },
        async (workspace) => {
          const finding = workspace.db.findings.find(
            (item) => item.id === fixture.findingOneId,
          );
          if (!finding) throw new Error("Expected seeded finding.");
          finding.status = "dismissed";
        },
      );

      const rows = await drizzle
        .select({ payload: findings.payload })
        .from(findings)
        .where(eq(findings.id, fixture.findingOneId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload.status).toBe("dismissed");
    } finally {
      await drizzle.execute(sql`
        DELETE FROM evidence WHERE project_id = ${fixture.projectId}
      `);
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});
