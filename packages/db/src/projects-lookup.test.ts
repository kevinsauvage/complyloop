import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { closeDrizzle, getDrizzle } from "./postgres";
import {
  findProjectsByGithubFullName,
  findProjectsByGithubRepoId,
  getProjectById,
  recordProjectDefaultBranch,
  recordProjectLastDeployment,
  recordProjectRepositoryIdentity,
  updateProject,
} from "./repo/projects";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * The webhook resolves same-named projects by installation id — the lookup
 * must return every per-org match in deterministic order, never one
 * arbitrary row.
 */
describe.skipIf(!enabled)("project github lookup", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("returns all org matches for a shared repo in id order", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-lookup`;
    const orgA = `org-lookup-a-${suffix}`;
    const orgB = `org-lookup-b-${suffix}`;
    const projectB = `proj-lookup-b-${suffix}`;
    const projectA = `proj-lookup-a-${suffix}`;
    const fullName = `Acme/Shared-${suffix}`;

    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES
        (${orgA}, ${`slug-a-${suffix}`}, '{}'::jsonb),
        (${orgB}, ${`slug-b-${suffix}`}, '{}'::jsonb)
    `);
    // Insert B first so id order differs from insert order.
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (
        ${projectB},
        'shared-b',
        ${`user-${suffix}`},
        ${orgB},
        ${JSON.stringify({ github: { fullName, installationId: 222 } })}::jsonb
      )
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (
        ${projectA},
        'shared-a',
        ${`user-${suffix}`},
        ${orgA},
        ${JSON.stringify({ github: { fullName, installationId: 111 } })}::jsonb
      )
    `);

    try {
      const matches = await findProjectsByGithubFullName(
        drizzle,
        fullName.toUpperCase(),
      );
      expect(matches.map((match) => match.id)).toEqual(
        [projectA, projectB].sort(),
      );
      expect(
        matches.find((match) => match.id === projectA)?.installationId,
      ).toBe(111);
      expect(
        matches.find((match) => match.id === projectB)?.installationId,
      ).toBe(222);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id IN (${projectA}, ${projectB})`,
      );
      await drizzle.execute(
        sql`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`,
      );
    }
  });

  it("finds a project by stable repo id and keeps a rename through a stale save", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-repo-id`;
    const orgA = `org-repo-a-${suffix}`;
    const orgB = `org-repo-b-${suffix}`;
    const projectA = `proj-repo-a-${suffix}`;
    const projectB = `proj-repo-b-${suffix}`;
    const oldName = `acme/old-${suffix}`;
    const newName = `acme/new-${suffix}`;
    const repoId = 777_000_000 + (Date.now() % 1_000_000);

    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES
        (${orgA}, ${`slug-repo-a-${suffix}`}, '{}'::jsonb),
        (${orgB}, ${`slug-repo-b-${suffix}`}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES
        (${projectB}, 'repo-b', ${`user-${suffix}`}, ${orgB}, ${JSON.stringify({
          github: {
            fullName: oldName,
            repoId,
            defaultBranch: "main",
            installationId: 222,
          },
        })}::jsonb),
        (${projectA}, 'repo-a', ${`user-${suffix}`}, ${orgA}, ${JSON.stringify({
          github: {
            fullName: oldName,
            repoId,
            defaultBranch: "main",
            installationId: 111,
          },
        })}::jsonb)
    `);

    try {
      const matches = await findProjectsByGithubRepoId(drizzle, repoId);
      expect(matches.map((match) => match.id)).toEqual(
        [projectA, projectB].sort(),
      );
      expect(matches.every((match) => match.repoId === repoId)).toBe(true);

      const stale: Project = {
        id: projectA,
        name: "repo-a",
        source: "github",
        sourceRef: `https://github.com/${oldName}`,
        orgId: orgA,
        createdAt: "2026-01-01T00:00:00.000Z",
        github: {
          fullName: oldName,
          repoId,
          defaultBranch: "main",
          private: false,
          installationId: 111,
        },
      };

      await recordProjectRepositoryIdentity(drizzle, projectA, {
        repoId,
        fullName: newName,
      });
      // A settings save holding the pre-rename copy must not revert it.
      await updateProject(drizzle, stale);

      const after = await getProjectById(drizzle, projectA);
      expect(after?.github?.fullName).toBe(newName);
      expect(after?.github?.repoId).toBe(repoId);
      expect(after?.sourceRef).toBe(`https://github.com/${newName}`);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id IN (${projectA}, ${projectB})`,
      );
      await drizzle.execute(
        sql`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`,
      );
    }
  });

  it("keeps delivery-written fields when a stale project copy is saved", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-stale-save`;
    const orgId = `org-stale-${suffix}`;
    const projectId = `proj-stale-${suffix}`;
    const stale: Project = {
      id: projectId,
      name: "stale",
      source: "github",
      orgId,
      createdAt: "2026-01-01T00:00:00.000Z",
      github: {
        fullName: `acme/stale-${suffix}`,
        defaultBranch: "main",
        private: false,
      },
    };
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-stale-${suffix}`}, '{}'::jsonb)
    `);
    await updateProject(drizzle, stale);

    try {
      // Deliveries land after the settings form loaded `stale`.
      await recordProjectDefaultBranch(drizzle, projectId, "trunk");
      await recordProjectLastDeployment(drizzle, projectId, {
        url: "https://app.example.com",
        sha: "a".repeat(40),
      });
      await updateProject(drizzle, {
        ...stale,
        runtimeBaseUrl: "https://app.example.com",
      });

      const saved = await getProjectById(drizzle, projectId);
      expect(saved?.runtimeBaseUrl).toBe("https://app.example.com");
      expect(saved?.github?.defaultBranch).toBe("trunk");
      expect(saved?.lastDeployment?.sha).toBe("a".repeat(40));
    } finally {
      await drizzle.execute(sql`DELETE FROM projects WHERE id = ${projectId}`);
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });
});
