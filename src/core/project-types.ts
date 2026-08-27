import type { DeterminationMethod, RequirementStatus } from "./statuses";

export interface Framework {
  id: string;
  name: string;
  version: string;
}

export interface Control {
  id: string;
  frameworkId: string;
  /** Primary reference, e.g. "WCAG 1.1.1" */
  code: string;
  /** Secondary reference, e.g. "RGAA 1.1" */
  secondaryCode: string;
  title: string;
  description: string;
  /** Identifier of the automated check that evaluates this control, if any. */
  checkId: string | null;
  /**
   * Relative compliance weight for prioritization (default 1).
   * Higher = fix sooner when severity/confidence are equal.
   */
  complianceWeight?: number;
}

/** Where the assessed tree comes from. GitHub-only for now. */
export type ProjectSource = "github";

/** Role within an organization (tenant). */
export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export interface Organization {
  id: string;
  name: string;
  /** URL-safe unique key within the store. */
  slug: string;
  createdAt: string;
}

/**
 * Membership in an organization. `userId` is the Auth.js subject when known;
 * `githubLogin` is used to invite teammates before/until they sign in.
 */
export interface OrgMembership {
  id: string;
  orgId: string;
  role: OrgRole;
  /** Auth.js user id once claimed. */
  userId?: string;
  /** GitHub login used for invite + claim on sign-in. */
  githubLogin: string;
  createdAt: string;
}

export interface ProjectGitHubMeta {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  /**
   * GitHub App installation that granted access to this repo.
   * When set, clone/PR/Checks use installation tokens (selected repos only).
   */
  installationId?: number;
}

export interface Project {
  id: string;
  name: string;
  source: ProjectSource;
  /** Canonical https://github.com/org/repo URL. */
  sourceRef?: string;
  createdAt: string;
  /**
   * Organization (tenant) that owns this project. When set, access is via
   * org membership RBAC.
   */
  orgId?: string;
  /**
   * Auth.js user id of the connector — used for GitHub token lookup
   * (webhooks / PR push). Not the sole ACL; prefer org membership.
   */
  ownerUserId?: string;
  /** Present when source is `github`. */
  github?: ProjectGitHubMeta;
  /**
   * Control IDs in scope for this project. `undefined` means every control
   * on the connected frameworks is in scope.
   */
  inScopeControlIds?: string[];
  /**
   * Staging / preview base URL for runtime (browser) accessibility audits.
   * When set, composition-sensitive rules use the rendered DOM as status truth.
   */
  runtimeBaseUrl?: string;
  /**
   * Pathnames to audit under `runtimeBaseUrl` (e.g. `/`, `/login`).
   * Defaults to `["/"]` when the base URL is set and this is omitted.
   */
  runtimeRoutes?: string[];
}

export const REQUIREMENT_EXCEPTION_REASONS = [
  "not_applicable",
  "accepted_risk",
  "compensating_control",
  "temporary",
] as const;

export type RequirementExceptionReason =
  (typeof REQUIREMENT_EXCEPTION_REASONS)[number];

/** Reason whose exceptions expire automatically after `expiresAt`. */
export const TEMPORARY_EXCEPTION_REASON: RequirementExceptionReason = "temporary";

export function isRequirementExceptionReason(
  value: unknown,
): value is RequirementExceptionReason {
  return (
    typeof value === "string" &&
    (REQUIREMENT_EXCEPTION_REASONS as readonly string[]).includes(value)
  );
}

export interface RequirementException {
  reason: RequirementExceptionReason;
  note: string;
  at: string;
  /** ISO timestamp; when set, assessment clears the exception after this time. */
  expiresAt?: string;
}

/** Human attestation that a manual (no-check) control passed, with retained evidence. */
export interface RequirementHumanPass {
  note: string;
  at: string;
}

export interface Requirement {
  id: string;
  projectId: string;
  controlId: string;
  status: RequirementStatus;
  determination: DeterminationMethod;
  updatedAt: string;
  /** Set when a human marks the requirement N/A or similar; blocks automated overwrite. */
  exception?: RequirementException;
  /**
   * Set when a human marks a manual control passed with a note.
   * Sticky across assessments until cleared (same as exceptions).
   */
  humanPass?: RequirementHumanPass;
}
