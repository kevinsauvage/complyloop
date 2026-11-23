import type { OrgAiSettingsEventRow } from "@complyloop/db/repo/org-ai-settings";

import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { removeOrgAiConfigAction } from "@/server/actions/org-ai";
import type { AiStatus } from "@/server/ai/types";

import { OrgAiSettingsForm } from "./org-ai-settings-form";

const EVENT_LABELS: Record<OrgAiSettingsEventRow["action"], string> = {
  configured: "Configuration saved",
  removed: "Configuration removed",
};

function statusLabel(status: AiStatus): string {
  if (status.source === "org") {
    return status.available
      ? "Your organization's key"
      : "Unavailable on this deployment";
  }
  return status.source === "platform" ? "Platform AI" : "Not configured";
}

function statusCopy(status: AiStatus): string {
  if (status.source === "org" && status.available) {
    const key = status.keyLast4 ? ` ••••${status.keyLast4}` : "";
    return `Your Vercel AI Gateway key${key}, model ${status.model ?? "unknown"}. Spend and provider choice follow your gateway account.`;
  }
  if (status.source === "org") {
    return "This deployment has no AI key encryption secret, so your organization's key cannot be read. Ask the operator to configure AI_KEYS_ENCRYPTION_KEY.";
  }
  if (status.source === "platform") {
    return "The operator's AI gateway is used for this organization. Add your own gateway key to route AI spend and data through your organization.";
  }
  return "AI isn't configured for this organization. An admin can add a Vercel AI Gateway key below.";
}

export function OrgAiSettingsCard({
  orgId,
  canManage,
  status,
  recentChanges,
}: {
  orgId: string;
  canManage: boolean;
  status: AiStatus;
  recentChanges: OrgAiSettingsEventRow[];
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>AI</CardTitle>
          <Badge variant={status.available ? "default" : "outline"}>
            {statusLabel(status)}
          </Badge>
        </div>
        <CardDescription>{statusCopy(status)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Model</dt>
            <dd className="font-mono text-xs text-foreground">
              {status.model ?? "None"}
            </dd>
          </div>
          {status.updatedAt ? (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Last saved
              </dt>
              <dd className="text-muted-foreground">
                {status.updatedBy ? `${status.updatedBy} · ` : null}
                <FormattedDateTime iso={status.updatedAt} />
              </dd>
            </div>
          ) : null}
        </dl>

        {!status.encryptionConfigured ? (
          <Alert className="surface-panel border-border/60 bg-muted/30">
            <AlertDescription>
              Bring-your-own-key is unavailable on this deployment: the operator
              must set AI_KEYS_ENCRYPTION_KEY before organization keys can be
              stored.
            </AlertDescription>
          </Alert>
        ) : null}

        {canManage && status.encryptionConfigured ? (
          <div className="flex flex-col gap-6 border-t border-border/60 pt-5">
            <section
              aria-labelledby="org-ai-key-heading"
              className="flex flex-col gap-2"
            >
              <h3
                id="org-ai-key-heading"
                className="text-sm font-medium text-foreground"
              >
                Gateway key and model
              </h3>
              <OrgAiSettingsForm orgId={orgId} status={status} />
            </section>
            {status.source === "org" ? (
              <section
                aria-labelledby="org-ai-remove-heading"
                className="flex flex-col gap-2 border-t border-border/60 pt-5"
              >
                <h3
                  id="org-ai-remove-heading"
                  className="text-sm font-medium text-foreground"
                >
                  Remove key
                </h3>
                <p className="text-sm text-muted-foreground">
                  Deletes the stored key. AI then uses platform AI when the
                  operator provides it, otherwise it turns off.
                </p>
                <StatefulActionForm
                  action={removeOrgAiConfigAction}
                  submitLabel="Remove AI key"
                  pendingLabel="Removing…"
                  variant="destructive"
                  size="sm"
                  className="flex flex-col items-start gap-2"
                  confirmTitle="Remove AI key?"
                  confirmMessage="The stored key is deleted and cannot be recovered. You can add a new key at any time."
                >
                  <input type="hidden" name="orgId" value={orgId} />
                </StatefulActionForm>
              </section>
            ) : null}
          </div>
        ) : null}

        {recentChanges.length > 0 ? (
          <section
            aria-labelledby="org-ai-history-heading"
            className="flex flex-col gap-2 border-t border-border/60 pt-5"
          >
            <h3
              id="org-ai-history-heading"
              className="text-sm font-medium text-foreground"
            >
              Recent changes
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              {recentChanges.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap gap-x-2 text-muted-foreground"
                >
                  <span className="font-medium text-foreground">
                    {EVENT_LABELS[event.action]}
                  </span>
                  <span>by {event.actor}</span>
                  <span aria-hidden>·</span>
                  <FormattedDateTime iso={event.at} />
                  {event.model ? (
                    <span className="font-mono text-xs">{event.model}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
