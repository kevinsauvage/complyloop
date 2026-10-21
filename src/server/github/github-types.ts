export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  /**
   * Whether the credential behind this summary may push (create branches and
   * commits). Required for the fix-PR flow: a read-only collaborator must not
   * be able to connect a repo and then open branches through the App token.
   */
  canPush: boolean;
  /** Present when listed via a GitHub App installation. */
  installationId?: number;
}
