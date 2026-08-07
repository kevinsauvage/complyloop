import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card, formatDateTime } from "@/components/ui";
import type { Alert } from "@/core/types";
import { markAlertReadAction } from "@/server/actions/alerts";

export function DashboardAlertsCard({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Card title="Regression alerts" className="border-red-200">
      <ul className="flex flex-col gap-3">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex flex-wrap items-start justify-between gap-3 text-sm text-red-800"
          >
            <div>
              <p>{alert.summary}</p>
              {(() => {
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
                if (bits.length === 0) return null;
                return (
                  <p className="mt-1 text-xs text-red-700/80">
                    {bits.join(" · ")}
                  </p>
                );
              })()}
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatDateTime(alert.at)}
              </p>
            </div>
            <StatefulActionForm
              action={markAlertReadAction}
              submitLabel="Dismiss"
              pendingLabel="Dismissing…"
              submitClassName="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-50"
            >
              <input type="hidden" name="alertId" value={alert.id} />
            </StatefulActionForm>
          </li>
        ))}
      </ul>
    </Card>
  );
}
