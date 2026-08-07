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
import { syncPayloadTable } from "./postgres-sync";

export async function persistCatalogToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
  await syncPayloadTable({
    length: db.frameworks.length,
    deleteAll: () => tx.delete(frameworks),
    upsert: () =>
      tx
        .insert(frameworks)
        .values(db.frameworks.map((item) => ({ id: item.id, payload: item })))
        .onConflictDoUpdate({
          target: frameworks.id,
          set: { payload: sql`excluded.payload` },
        }),
    prune: () =>
      tx.delete(frameworks).where(
        notInArray(
          frameworks.id,
          db.frameworks.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.controls.length,
    deleteAll: () => tx.delete(controls),
    upsert: () =>
      tx
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
        }),
    prune: () =>
      tx.delete(controls).where(
        notInArray(
          controls.id,
          db.controls.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.organizations.length,
    deleteAll: () => tx.delete(organizations),
    upsert: () =>
      tx
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
        }),
    prune: () =>
      tx.delete(organizations).where(
        notInArray(
          organizations.id,
          db.organizations.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.memberships.length,
    deleteAll: () => tx.delete(memberships),
    upsert: () =>
      tx
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
        }),
    prune: () =>
      tx.delete(memberships).where(
        notInArray(
          memberships.id,
          db.memberships.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.projects.length,
    deleteAll: () => tx.delete(projects),
    upsert: () =>
      tx
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
        }),
    prune: () =>
      tx.delete(projects).where(
        notInArray(
          projects.id,
          db.projects.map((item) => item.id),
        ),
      ),
  });
}
