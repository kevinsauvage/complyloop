import {
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import type { Db } from "@complyloop/db/types";
import { emptyDb } from "@complyloop/db/types";

import type { ProjectWriteWorkspace } from "@/server/workspace";

import { testFinding } from "./finding";
import { testMembership } from "./membership";
import { testProject } from "./project";
import { testRemediation } from "./remediation";

/**
 * Full write-capable workspace fixture. Production `getWorkspace()` returns
 * tenancy only (no `db`); action tests that invoke `withProjectWrite` need the
 * slice, so fixtures keep `db`.
 */
export function testWorkspace(
  options: {
    role?: OrgMembership["role"];
    userId?: string;
    orgId?: string;
    project?: Project;
    findings?: Finding[];
    remediations?: Remediation[];
    db?: Partial<Db>;
  } = {},
): ProjectWriteWorkspace {
  const userId = options.userId ?? "user-1";
  const orgId = options.orgId ?? "org-1";
  const role = options.role ?? "member";
  const project = options.project ?? testProject({ orgId });
  const primaryFinding =
    options.findings?.[0] ?? testFinding({ projectId: project.id });
  const findings = options.findings ?? [primaryFinding];
  const remediations = options.remediations ?? [
    testRemediation({ findingId: primaryFinding.id, history: [] }),
  ];

  const db = {
    ...emptyDb(),
    organizations: [{ id: orgId, name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [testMembership(role, { userId, orgId })],
    projects: [project],
    findings,
    remediations,
    ...options.db,
  } as Db;

  return {
    project,
    userId,
    githubLogin: userId,
    access: {
      userId,
      githubLogin: userId,
      organizations: db.organizations,
      memberships: db.memberships,
    },
    projects: db.projects,
    visibleProjects: [project],
    organizations: db.organizations,
    activeOrgId: orgId,
    db,
  };
}
