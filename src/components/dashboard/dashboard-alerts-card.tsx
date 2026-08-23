import { StatefulActionForm } from "@/components/stateful-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateTime } from "@/components/page-primitives";
import type { Alert as AlertRecord } from "@/core/finding-types";
import { markAlertReadAction } from "@/server/actions/alerts";
import { TriangleAlert } from "lucide-react";

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
  if (typeof alert.detail?.changeContext === "string") {
    bits.push(alert.detail.changeContext);
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

export function DashboardAlertsCard({ alerts }: { alerts: AlertRecord[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="regression-alerts-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="regression-alerts-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Regression alerts
        </h2>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {alerts.length} unread
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {alerts.map((alert) => {
          const detailLine = alertDetailLine(alert);
          return (
            <li key={alert.id}>
              <Alert
                variant="destructive"
                className="border-destructive/40 bg-destructive/5 shadow-none"
              >
                <TriangleAlert aria-hidden />
                <AlertTitle className="text-base leading-snug">
                  {alert.summary}
                </AlertTitle>
                <AlertDescription>
                  {detailLine ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed opacity-90">
                      {detailLine}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <time
                      className="text-xs opacity-70"
                      dateTime={alert.at}
                    >
                      {formatDateTime(alert.at)}
                    </time>
                    <StatefulActionForm
                      action={markAlertReadAction}
                      submitLabel="Dismiss"
                      pendingLabel="Dismissing…"
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
