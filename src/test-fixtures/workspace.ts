import type { Finding, Remediation } from "@/core/finding-types";
import type { OrgMembership, Project } from "@/core/project-types";
import type { Db } from "@/server/db";
import { emptyDb } from "@/server/db-store/types";
import type { Workspace } from "@/server/workspace";
import { testFinding } from "./finding";
import { testMembership } from "./membership";
import { testProject } from "./project";
import { testRemediation } from "./remediation";

export function testWorkspace(options: {
  role?: OrgMembership["role"];
  userId?: string;
  orgId?: string;
  project?: Project;
  findings?: Finding[];
  remediations?: Remediation[];
  db?: Partial<Db>;
} = {}): Workspace {
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
    organizations: [
      { id: orgId, name: "Acme", slug: "acme", createdAt: "" },
    ],
    memberships: [testMembership(role, { userId, orgId })],
    projects: [project],
    findings,
    remediations,
    ...options.db,
  } as Db;

  return {
    db,
    project,
    userId,
    githubLogin: userId,
    access: {
      userId,
      githubLogin: userId,
      organizations: db.organizations,
      memberships: db.memberships,
    },
    visibleProjects: [project],
    organizations: db.organizations,
    activeOrgId: orgId,
  };
}
