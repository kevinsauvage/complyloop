import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GitHubRepoPicker } from "./github-repo-picker";

vi.mock("@/server/actions/connect", () => ({
  connectGitHubRepoAction: vi.fn(),
  disconnectGitHubRepoAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function repoFixture(fullName: string) {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    name: name ?? fullName,
    description: `${fullName} fixture`,
    private: false,
    defaultBranch: "main",
    updatedAt: new Date().toISOString(),
    htmlUrl: `https://github.com/${fullName}`,
    cloneUrl: `https://github.com/${fullName}.git`,
    installationId: 123,
    owner,
  };
}

function mockReposFetch() {
  return vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({
      repos: [repoFixture("acme/alpha"), repoFixture("acme/beta")],
      hasMore: false,
    });
  });
}

describe("GitHubRepoPicker empty state", () => {
  it("links to the GitHub App install page when the slug is configured", () => {
    render(
      <GitHubRepoPicker
        initialRepos={[]}
        connectedByFullName={{}}
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
      <GitHubRepoPicker initialRepos={[]} connectedByFullName={{}} />,
    );

    expect(screen.getByText(/GITHUB_APP_SLUG/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Install the GitHub App/i }),
    ).not.toBeInTheDocument();
  });
});

describe("GitHubRepoPicker fetchOnMount", () => {
  it("loads repositories on mount without typing", async () => {
    vi.stubGlobal("fetch", mockReposFetch());

    render(
      <GitHubRepoPicker
        initialRepos={[]}
        connectedByFullName={{}}
        fetchOnMount
      />,
    );

    expect(screen.getByText(/Loading repositories/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("acme/alpha")).toBeInTheDocument();
    });
    expect(screen.getByText("acme/beta")).toBeInTheDocument();
    expect(
      screen.queryByText(/Loading repositories/i),
    ).not.toBeInTheDocument();
  });

  it("recovers from the StrictMode mount-abort-remount cycle", async () => {
    vi.stubGlobal("fetch", mockReposFetch());

    render(
      <StrictMode>
        <GitHubRepoPicker
          initialRepos={[]}
          connectedByFullName={{}}
          fetchOnMount
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("acme/alpha")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Loading repositories/i),
    ).not.toBeInTheDocument();
  });
});
