import { and, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import {
  controls,
  frameworks,
  memberships,
  organizations,
  projects,
} from "./schema";
import { effectiveLoadScope, isFullLoadScope } from "./postgres-scope";
import { syncPayloadTable } from "./postgres-sync";

function keepIdsOrNeverMatch(ids: readonly string[]): string[] {
  // notInArray([]) is invalid SQL; a sentinel that cannot match real ids.
  return ids.length > 0 ? [...ids] : ["__none__"];
}

export async function persistCatalogToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
  const scope = effectiveLoadScope(db.loadScope);
  const orgIds = isFullLoadScope(scope) ? null : [...scope.orgIds];
  const scopedProjectIds = isFullLoadScope(scope) ? null : [...scope.projectIds];

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
          keepIdsOrNeverMatch(db.frameworks.map((item) => item.id)),
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
          keepIdsOrNeverMatch(db.controls.map((item) => item.id)),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.organizations.length,
    deleteAll: () =>
      orgIds && orgIds.length > 0
        ? tx.delete(organizations).where(inArray(organizations.id, orgIds))
        : orgIds
          ? Promise.resolve()
          : tx.delete(organizations),
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(
        db.organizations.map((item) => item.id),
      );
      if (orgIds) {
        if (orgIds.length === 0) return Promise.resolve();
        return tx
          .delete(organizations)
          .where(
            and(
              inArray(organizations.id, orgIds),
              notInArray(organizations.id, keep),
            ),
          );
      }
      return tx.delete(organizations).where(notInArray(organizations.id, keep));
    },
  });

  await syncPayloadTable({
    length: db.memberships.length,
    deleteAll: () =>
      orgIds && orgIds.length > 0
        ? tx.delete(memberships).where(inArray(memberships.orgId, orgIds))
        : orgIds
          ? Promise.resolve()
          : tx.delete(memberships),
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(db.memberships.map((item) => item.id));
      if (orgIds) {
        if (orgIds.length === 0) return Promise.resolve();
        return tx
          .delete(memberships)
          .where(
            and(
              inArray(memberships.orgId, orgIds),
              notInArray(memberships.id, keep),
            ),
          );
      }
      return tx.delete(memberships).where(notInArray(memberships.id, keep));
    },
  });

  await syncPayloadTable({
    length: db.projects.length,
    deleteAll: () => {
      if (!orgIds) return tx.delete(projects);
      if (!scopedProjectIds || scopedProjectIds.length === 0) {
        return Promise.resolve();
      }
      return tx.delete(projects).where(inArray(projects.id, scopedProjectIds));
    },
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(db.projects.map((item) => item.id));
      if (!orgIds) {
        return tx.delete(projects).where(notInArray(projects.id, keep));
      }
      if (!scopedProjectIds || scopedProjectIds.length === 0) {
        return Promise.resolve();
      }
      return tx
        .delete(projects)
        .where(
          and(
            inArray(projects.id, scopedProjectIds),
            notInArray(projects.id, keep),
          ),
        );
    },
  });
}
