export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  /** Present when listed via a GitHub App installation. */
  installationId?: number;
}
