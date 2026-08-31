import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRepoPicker } from "./github-repo-picker";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/actions/connect", () => ({
  connectGitHubRepoAction: vi.fn(),
  disconnectGitHubRepoAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("GitHubRepoPicker empty state", () => {
  it("links to the GitHub App install page when the slug is configured", () => {
    render(
      <GitHubRepoPicker
        repos={[]}
        connectedByFullName={{}}
        usesGitHubApp
        appInstallUrl="https://github.com/apps/complyloop/installations/new"
      />,
    );

    const link = screen.getByRole("link", { name: /Install the GitHub App/i });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/apps/complyloop/installations/new",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("explains that the slug is missing when there is no install URL", () => {
    render(
      <GitHubRepoPicker repos={[]} connectedByFullName={{}} usesGitHubApp />,
    );

    expect(screen.getByText(/GITHUB_APP_SLUG/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Install the GitHub App/i }),
    ).not.toBeInTheDocument();
  });
});
