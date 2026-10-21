import type { Metadata } from "next";

import {
  ConnectProjectCard,
  ConnectProjectPanel,
} from "@/components/github/connect-project-panel";
import {
  EmptyState,
  PageContent,
  PageHeader,
  PageSection,
} from "@/components/primitives/page-primitives";
import { SignInWithGitHubButton } from "@/components/shell/sign-in-with-github-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  matchesPortfolioFilter,
  parsePortfolioFilter,
  PORTFOLIO_FILTER_LABEL,
  summarizePortfolio,
} from "@/core/portfolio";
import { getSession } from "@/server/auth-session";
import { loadPortfolioView } from "@/server/workspace/portfolio-view";

import {
  PortfolioFilterChips,
  PortfolioSummaryTiles,
} from "./_components/portfolio-overview";
import { ProjectPortfolioTable } from "./_components/project-portfolio-table";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Compliance state across every client project in your organization.",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = parsePortfolioFilter((await searchParams).filter);
  const session = await getSession();
  if (!session?.user?.id) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Sign in with GitHub to see every project's compliance state."
        />
        <EmptyState
          title="Sign in required"
          action={<SignInWithGitHubButton />}
        >
          Use Sign in with GitHub to review compliance across your client
          projects.
        </EmptyState>
      </>
    );
  }

  const { org, rows, canCreateProject } = await loadPortfolioView();

  if (!org) {
    return (
      <>
        <PageHeader title="Overview" description="No organization selected." />
        <EmptyState title="No organization yet">
          A personal organization is created on first sign-in. If this persists,
          sign out and sign in again.
        </EmptyState>
      </>
    );
  }

  const createAction = canCreateProject ? (
    <ConnectProjectPanel defaultOpen={false} triggerLabel="Create project" />
  ) : null;

  if (rows.length === 0) {
    return (
      <>
        <PageHeader
          title="Overview"
          description={`Compliance state across ${org.name}.`}
        />
        <PageContent>
          {canCreateProject ? (
            <ConnectProjectCard>
              <ConnectProjectPanel defaultOpen />
            </ConnectProjectCard>
          ) : (
            <EmptyState title="No projects yet">
              Ask an organization owner or admin to connect a repository.
            </EmptyState>
          )}
        </PageContent>
      </>
    );
  }

  const summary = summarizePortfolio(rows);
  const visible = filter
    ? rows.filter((row) => matchesPortfolioFilter(row, filter))
    : rows;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Compliance state across every project in ${org.name}. Sorted by what needs attention.`}
      >
        {createAction}
      </PageHeader>
      <PageContent>
        <PortfolioSummaryTiles summary={summary} />
        <PageSection
          title={
            filter
              ? `${visible.length} of ${rows.length} projects · ${PORTFOLIO_FILTER_LABEL[filter]}`
              : `${rows.length} project${rows.length === 1 ? "" : "s"}`
          }
          description="Counts are live: requirement verdicts, open findings, unread regressions, the last completed assessment and the current pipeline state."
        >
          <PortfolioFilterChips summary={summary} active={filter} />
          <Card className="overflow-hidden shadow-none">
            <CardContent className="p-2 sm:p-4">
              {visible.length > 0 ? (
                <ProjectPortfolioTable rows={visible} />
              ) : (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No projects match this filter.
                </p>
              )}
            </CardContent>
          </Card>
        </PageSection>
      </PageContent>
    </>
  );
}
