/** Stable ids shared by e2e seed + Playwright specs. */
export const E2E_OWNER = {
  id: "e2e-owner",
  login: "e2e-owner",
  name: "E2E Owner",
  email: "e2e-owner@example.com",
} as const;

export const E2E_VIEWER = {
  id: "e2e-viewer",
  login: "e2e-viewer",
  name: "E2E Viewer",
  email: "e2e-viewer@example.com",
} as const;

export const E2E_ORG_ID = "e2e-org";
export const E2E_PROJECT_ID = "e2e-project";
export const E2E_PROJECT_FULL_NAME = "e2e/sample-app";

export type E2eProjectTab =
  "dashboard" | "requirements" | "findings" | "evidence" | "settings";

/** Project-scoped path for the seeded project — the URL names the project. */
export function projectPath(tab: E2eProjectTab): string {
  return `/projects/${E2E_PROJECT_ID}/${tab}`;
}

export function projectFindingPath(findingId: string): string {
  return `/projects/${E2E_PROJECT_ID}/findings/${findingId}`;
}
