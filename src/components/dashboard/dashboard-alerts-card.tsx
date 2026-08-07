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
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Regression alerts
      </h2>
      {alerts.map((alert) => {
        const detailLine = alertDetailLine(alert);
        return (
          <Alert key={alert.id} variant="destructive">
            <TriangleAlert />
            <AlertTitle>{alert.summary}</AlertTitle>
            <AlertDescription>
              {detailLine ? <p>{detailLine}</p> : null}
              <p className="mt-1 text-xs opacity-80">{formatDateTime(alert.at)}</p>
              <div className="mt-3">
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
        );
      })}
    </div>
  );
}
