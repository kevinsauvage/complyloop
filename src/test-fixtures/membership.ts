import type { OrgMembership } from "@complyloop/domain/project-types";

export function testMembership(
  role: OrgMembership["role"],
  partial: Partial<OrgMembership> = {},
): OrgMembership {
  const userId = partial.userId ?? "user-1";
  return {
    id: partial.id ?? `m-${userId}`,
    orgId: partial.orgId ?? "org-1",
    role,
    userId,
    githubLogin: partial.githubLogin ?? userId,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}
