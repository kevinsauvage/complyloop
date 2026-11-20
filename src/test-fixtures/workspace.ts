import {
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { emptyWorkspaceSlice } from "@complyloop/db/types";

import type { Workspace } from "@/server/workspace/workspace";

import { testFinding } from "./finding";
import { testMembership } from "./membership";
import { testProject } from "./project";
import { testRemediation } from "./remediation";

/**
 * In-memory slice backing the mocked repo + transaction helpers in action
 * tests. Reads and writes go through `register-action-workspace-mock`, which
 * makes this the fake database the actions' targeted repo calls hit.
 */
export interface TestWorkspace extends Workspace {
  db: WorkspaceSlice;
}

export function testWorkspace(
  options: {
    role?: OrgMembership["role"];
    userId?: string;
    orgId?: string;
    project?: Project;
    findings?: Finding[];
    remediations?: Remediation[];
    db?: Partial<WorkspaceSlice>;
  } = {},
): TestWorkspace {
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
    ...emptyWorkspaceSlice(),
    organizations: [{ id: orgId, name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [testMembership(role, { userId, orgId })],
    projects: [project],
    findings,
    remediations,
    ...options.db,
  } as WorkspaceSlice;

  return {
    userId,
    githubLogin: userId,
    access: {
      userId,
      githubLogin: userId,
      organizations: db.organizations,
      memberships: db.memberships,
    },
    projects: db.projects,
    organizations: db.organizations,
    activeOrgId: orgId,
    db,
  };
}

/**
 * Fixture factory for action suites that swap only the slice: one finding, one
 * implemented remediation, and the overrides the test cares about.
 */
export function makeBaseWorkspace(defaults: {
  project: Project;
  finding: Finding;
  role: OrgMembership["role"];
}): (
  overrides?: Partial<WorkspaceSlice>,
  role?: OrgMembership["role"],
) => TestWorkspace {
  return (overrides = {}, role = defaults.role) => {
    const { findings, remediations, ...rest } = overrides;
    return testWorkspace({
      role,
      userId: "user-1",
      project: defaults.project,
      findings: findings ?? [defaults.finding],
      remediations: remediations ?? [
        testRemediation({
          status: "implemented",
          suggestion: null,
          history: [],
        }),
      ],
      db: {
        requirements: [],
        alerts: [],
        ...rest,
      },
    });
  };
}
