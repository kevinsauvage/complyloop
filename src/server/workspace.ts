import { cache } from "react";
import { auth } from "@/auth";
import type {
  Control,
  Organization,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { type Finding, type Remediation } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { getFindingById } from "@complyloop/db/repo/findings";
import { getRemediationByFindingId } from "@complyloop/db/repo/remediations";
import { loadTenancyDb } from "@complyloop/db/workspace-load";
import {
  readActiveOrgCookie,
  readActiveProjectCookie,
} from "./active-cookies";
import type { Db } from "@complyloop/db/types";
import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import { orgsForUser, resolveActiveOrgId } from "./org-queries";
import {
  type AccessContext,
  accessFromStore,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";

/**
 * Request-scoped tenancy + active project. Compliance rows (findings, etc.)
 * load via {@link getProjectRuntime} or write-time slices — not here.
 */
export interface Workspace {
  /** Null when the viewer has no connected project yet. */
  project: Project | null;
  /** Auth.js user id when signed in; null when unsigned. */
  userId: string | null;
  githubLogin: string | null;
  access: AccessContext;
  /** All projects in the viewer's orgs (permission / lookup). */
  projects: Project[];
  /** Projects the current viewer may switch between (scoped to active org). */
  visibleProjects: Project[];
  /** Orgs the signed-in user belongs to. */
  organizations: Organization[];
  /** Selected org for management + new connects; null when unsigned. */
  activeOrgId: string | null;
}

/** Workspace plus the in-transaction project slice for {@link withProjectWrite}. */
export type ProjectWriteWorkspace = Workspace & { db: Db };

function projectsForActiveOrg(
  projects: ReadonlyArray<Project>,
  access: AccessContext,
  activeOrgId: string | null,
): Project[] {
  const visible = visibleProjects(projects, access);
  if (!activeOrgId) return [];
  return visible.filter((project) => project.orgId === activeOrgId);
}

export function prepareWorkspaceState(
  db: Pick<Db, "organizations" | "memberships" | "projects">,
  userId: string | null,
  githubLogin: string | null,
  preferredOrgId: string | null,
  preferredProjectId: string | null,
): Workspace {
  const access = accessFromStore(db, userId, githubLogin);
  const organizations = userId ? orgsForUser(db, userId) : [];
  const activeOrgId =
    userId != null
      ? (resolveActiveOrgId(db, userId, preferredOrgId) ?? null)
      : null;

  const scoped = projectsForActiveOrg(db.projects, access, activeOrgId);
  const project =
    resolveActiveProject(
      scoped.length > 0 ? scoped : db.projects,
      preferredProjectId,
      access,
    ) ?? null;

  return {
    project,
    userId,
    githubLogin,
    access,
    projects: db.projects,
    visibleProjects:
      scoped.length > 0 ? scoped : visibleProjects(db.projects, access),
    organizations,
    activeOrgId,
  };
}

/** Auth + active org/project cookies — shared by read and write paths. */
export async function readViewerSession(): Promise<{
  userId: string | null;
  githubLogin: string | null;
  preferredOrgId: string | null;
  preferredProjectId: string | null;
}> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  return {
    userId,
    githubLogin,
    preferredOrgId: userId ? await readActiveOrgCookie() : null,
    preferredProjectId: await readActiveProjectCookie(),
  };
}

async function loadViewerWorkspaceState(): Promise<Workspace> {
  const { userId, githubLogin, preferredOrgId, preferredProjectId } =
    await readViewerSession();

  const db = await loadTenancyDb(await getDrizzle(), {
    userId,
    githubLogin,
    activeProjectId: preferredProjectId,
  });
  return prepareWorkspaceState(
    db,
    userId,
    githubLogin,
    preferredOrgId,
    preferredProjectId,
  );
}

/**
 * Tenancy + active project for app pages and layout. Memoized per React request.
 * Load findings/requirements/etc. with {@link getProjectRuntime}.
 */
export const getWorkspace = cache(async (): Promise<Workspace> =>
  loadViewerWorkspaceState(),
);

export function controlById(controlId: string): Control {
  const control = shippedCatalog().controls.find(
    (candidate) => candidate.id === controlId,
  );
  if (!control) throw new PublicError("Unknown control.");
  return control;
}

/** Slice lookup used inside {@link withProjectWrite} callbacks. */
export function findingById(db: Db, findingId: string): Finding {
  const finding = db.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new PublicError("Unknown finding.");
  return finding;
}

function findRemediationForFinding(
  db: Db,
  findingId: string,
): Remediation | undefined {
  return db.remediations.find(
    (candidate) => candidate.findingId === findingId,
  );
}

export function remediationForFinding(db: Db, findingId: string): Remediation {
  const remediation = findRemediationForFinding(db, findingId);
  if (!remediation) throw new PublicError("No remediation for that finding.");
  return remediation;
}

/** Request-path finding load (pages / action previews). */
export async function requireFinding(findingId: string): Promise<Finding> {
  const finding = await getFindingById(await getDrizzle(), findingId);
  if (!finding) throw new PublicError("Unknown finding.");
  return finding;
}

/** Request-path remediation load (pages / action previews). */
export async function requireRemediationForFinding(
  findingId: string,
): Promise<Remediation> {
  const remediation = await getRemediationByFindingId(
    await getDrizzle(),
    findingId,
  );
  if (!remediation) throw new PublicError("No remediation for that finding.");
  return remediation;
}
