import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/core/lifecycle";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { Alert as AlertRecord } from "@complyloop/analysis-core/contract/entities";
import {
  markAlertReadAction,
  markAllAlertsReadAction,
} from "@/server/actions/alerts";

function alertPrimaryHref(alert: AlertRecord): string | null {
  const findingId = alert.detail?.findingId;
  if (typeof findingId === "string") return `/findings/${findingId}`;
  const controlId = alert.detail?.controlId;
  if (typeof controlId === "string") return "/requirements?status=failed";
  return null;
}

function alertDetailLine(alert: AlertRecord): string | null {
  const bits: string[] = [];
  if (typeof alert.detail?.trigger === "string") {
    bits.push(`Trigger: ${alert.detail.trigger}`);
  }
  if (
    typeof alert.detail?.from === "string" &&
    typeof alert.detail?.to === "string"
  ) {
    bits.push(`${alert.detail.from} → ${alert.detail.to}`);
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

function changeContextLink(
  alert: AlertRecord,
  githubFullName?: string,
): { href: string; label: string; external?: boolean } | null {
  const commitSha = alert.detail?.commitSha;
  if (typeof commitSha === "string" && githubFullName) {
    const label =
      typeof alert.detail?.changeContext === "string"
        ? alert.detail.changeContext
        : `Commit ${commitSha.slice(0, 7)}`;
    return {
      href: `https://github.com/${githubFullName}/commit/${commitSha}`,
      label,
      external: true,
    };
  }

  const filePath = alert.detail?.changeFilePath;
  if (typeof filePath === "string") {
    return { href: "/findings", label: filePath };
  }

  if (typeof alert.detail?.changeContext === "string") {
    return null;
  }

  return null;
}

export function DashboardAlertsCard({
  alerts,
  project,
}: {
  alerts: AlertRecord[];
  project: Pick<Project, "github" | "id">;
}) {
  if (alerts.length === 0) return null;

  const githubFullName = project.github?.fullName;

  return (
    <section
      className="surface-panel rounded-2xl border-destructive/30 bg-destructive/5 p-4 sm:p-5"
      aria-labelledby="regression-alerts-heading"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <div>
            <h2
              id="regression-alerts-heading"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Needs review
            </h2>
            <p className="text-xs text-muted-foreground">
              Unread status changes that need review
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="rounded-full border border-destructive/25 bg-background/60 px-2.5 py-1 font-mono text-xs text-destructive tabular-nums">
            {alerts.length} unread
          </p>
          <StatefulActionForm
            action={markAllAlertsReadAction}
            submitLabel="Mark all read"
            pendingLabel="Marking…"
            variant="outline"
            size="sm"
          >
            <input type="hidden" name="projectId" value={project.id} />
          </StatefulActionForm>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {alerts.map((alert) => {
          const detailLine = alertDetailLine(alert);
          const primaryHref = alertPrimaryHref(alert);
          const changeLink = changeContextLink(alert, githubFullName);
          return (
            <li key={alert.id}>
              <Alert
                variant="destructive"
                className="border-destructive/30 bg-background/70 shadow-none"
              >
                <TriangleAlert aria-hidden />
                <AlertTitle className="text-base leading-snug">
                  {primaryHref ? (
                    <Link
                      href={primaryHref}
                      className="hover:text-destructive hover:underline"
                    >
                      {alert.summary}
                    </Link>
                  ) : (
                    alert.summary
                  )}
                </AlertTitle>
                <AlertDescription>
                  {detailLine ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                      {detailLine}
                    </p>
                  ) : null}
                  {changeLink ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                      {changeLink.external ? (
                        <a
                          href={changeLink.href}
                          className="underline underline-offset-4 hover:opacity-100"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {changeLink.label}
                        </a>
                      ) : (
                        <Link
                          href={changeLink.href}
                          className="underline underline-offset-4 hover:opacity-100"
                        >
                          {changeLink.label}
                        </Link>
                      )}
                    </p>
                  ) : typeof alert.detail?.changeContext === "string" ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed opacity-90">
                      {alert.detail.changeContext}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={alert.at}
                    >
                      {formatDateTime(alert.at)}
                    </time>
                    <StatefulActionForm
                      action={markAlertReadAction}
                      submitLabel="Mark as read"
                      pendingLabel="Marking as read…"
                      variant="outline"
                      size="sm"
                    >
                      <input type="hidden" name="alertId" value={alert.id} />
                    </StatefulActionForm>
                  </div>
                </AlertDescription>
              </Alert>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
