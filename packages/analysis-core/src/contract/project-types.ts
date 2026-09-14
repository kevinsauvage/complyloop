/**
 * Tenancy and reference data: Organization, Project, Control, presets.
 * Persisted compliance rows (Requirement, Finding, Remediation, Evidence,
 * Alert) live in `./entities.ts` — import them from there.
 */
export const DEFAULT_PAGE_SIZE = 25;

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
  /** Organization (tenant) that owns this project; access is via org membership RBAC. */
  orgId: string;
  /**
   * Auth.js user id of the connector — used for GitHub token lookup
   * (webhooks / PR push). Not the sole ACL; prefer org membership.
   */
  ownerUserId?: string;
  /** Present when source is `github`. */
  github?: ProjectGitHubMeta;
  /**
   * Default framework preset for this project. Set on connect, editable in
   * Settings. Drives assessment scope and the Requirements page when no
   * `?presetId=` is present. When unset, every control in the catalog is
   * in scope.
   */
  defaultPresetId?: string;
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
