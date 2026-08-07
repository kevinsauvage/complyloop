import { notInArray, sql } from "drizzle-orm";
import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import {
  controls,
  frameworks,
  memberships,
  organizations,
  projects,
} from "./schema";

export async function persistCatalogToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
    // Frameworks
    if (db.frameworks.length === 0) {
      await tx.delete(frameworks);
    } else {
      await tx
        .insert(frameworks)
        .values(
          db.frameworks.map((item) => ({ id: item.id, payload: item })),
        )
        .onConflictDoUpdate({
          target: frameworks.id,
          set: { payload: sql`excluded.payload` },
        });
      await tx.delete(frameworks).where(
        notInArray(
          frameworks.id,
          db.frameworks.map((item) => item.id),
        ),
      );
    }

    // Controls
    if (db.controls.length === 0) {
      await tx.delete(controls);
    } else {
      await tx
        .insert(controls)
        .values(
          db.controls.map((item) => ({
            id: item.id,
            frameworkId: item.frameworkId,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: controls.id,
          set: {
            frameworkId: sql`excluded.framework_id`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(controls).where(
        notInArray(
          controls.id,
          db.controls.map((item) => item.id),
        ),
      );
    }

    // Organizations
    if (db.organizations.length === 0) {
      await tx.delete(organizations);
    } else {
      await tx
        .insert(organizations)
        .values(
          db.organizations.map((item) => ({
            id: item.id,
            slug: item.slug,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: organizations.id,
          set: {
            slug: sql`excluded.slug`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(organizations).where(
        notInArray(
          organizations.id,
          db.organizations.map((item) => item.id),
        ),
      );
    }

    // Memberships
    if (db.memberships.length === 0) {
      await tx.delete(memberships);
    } else {
      await tx
        .insert(memberships)
        .values(
          db.memberships.map((item) => ({
            id: item.id,
            orgId: item.orgId,
            userId: item.userId ?? null,
            githubLogin: item.githubLogin,
            role: item.role,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: memberships.id,
          set: {
            orgId: sql`excluded.org_id`,
            userId: sql`excluded.user_id`,
            githubLogin: sql`excluded.github_login`,
            role: sql`excluded.role`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(memberships).where(
        notInArray(
          memberships.id,
          db.memberships.map((item) => item.id),
        ),
      );
    }

    // Projects
    if (db.projects.length === 0) {
      await tx.delete(projects);
    } else {
      await tx
        .insert(projects)
        .values(
          db.projects.map((item) => ({
            id: item.id,
            name: item.name,
            ownerUserId: item.ownerUserId ?? null,
            orgId: item.orgId ?? null,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            name: sql`excluded.name`,
            ownerUserId: sql`excluded.owner_user_id`,
            orgId: sql`excluded.org_id`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(projects).where(
        notInArray(
          projects.id,
          db.projects.map((item) => item.id),
        ),
      );
    }
}
