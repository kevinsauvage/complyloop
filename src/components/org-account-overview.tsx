import Link from "next/link";
import { formatDateTime, MetaTile } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { OrgRole } from "@complyloop/analysis-core/contract/project-types";
import { STATUS_TONE_BADGE, roleTone } from "@/core/status-display";
import { cn } from "@/lib/utils";

type OrgAccountOverviewProps = {
  orgName: string;
  orgSlug: string;
  createdAt: string;
  ownerGithubLogin: string | null;
  viewerRole: OrgRole | null;
  projectCount: number;
  memberCount: number;
  pendingInviteCount: number;
  supportEmail: string | null;
};

export function OrgAccountOverview({
  orgName,
  orgSlug,
  createdAt,
  ownerGithubLogin,
  viewerRole,
  projectCount,
  memberCount,
  pendingInviteCount,
  supportEmail,
}: OrgAccountOverviewProps) {
  return (
    <Card className="shadow-none">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="hidden size-2 shrink-0 rounded-full bg-signal sm:block"
            aria-hidden
          />
          <h2 className="font-heading text-base font-medium leading-snug">
            Account
          </h2>
          <Badge variant="secondary">Early access pilot</Badge>
          {viewerRole ? (
            <Badge className={cn("capitalize", STATUS_TONE_BADGE[roleTone(viewerRole)])}>
              {viewerRole}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Ownership, plan, and how this workspace&apos;s data is retained.
          Billing and self-serve plans are not enabled yet for this pilot.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          <SummaryChip
            label="Projects"
            value={String(projectCount)}
          />
          <SummaryChip label="Members" value={String(memberCount)} />
          {pendingInviteCount > 0 ? (
            <SummaryChip
              label="Pending invites"
              value={String(pendingInviteCount)}
              tone="review"
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <MetaTile label="Organization">
          <p className="font-medium text-foreground">{orgName}</p>
          <p className="font-mono text-xs text-muted-foreground">{orgSlug}</p>
        </MetaTile>
        <MetaTile label="Workspace owner">
          <p className="font-medium text-foreground">
            {ownerGithubLogin ? `@${ownerGithubLogin}` : "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            Controls export, deletion, and admin roles. Ownership transfer is
            not supported yet.
          </p>
        </MetaTile>
        <MetaTile label="Plan">
          <p className="text-sm text-muted-foreground">
            Manually provisioned. Seat and project quotas are not enforced in
            product yet.
          </p>
        </MetaTile>
        <MetaTile label="Workspace age">
          <p className="text-foreground">Created {formatDateTime(createdAt)}</p>
        </MetaTile>
        <MetaTile label="Support contact" className="sm:col-span-2">
          {supportEmail ? (
            <a
              href={`mailto:${supportEmail}`}
              className="font-medium text-signal underline-offset-4 hover:underline"
            >
              {supportEmail}
            </a>
          ) : (
            <p className="text-muted-foreground">
              Your ComplyLoop pilot operator
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Export and delete from this page. Assisted deletion within 30 days —
            see{" "}
            <Link
              href="/legal/privacy"
              className="text-foreground underline underline-offset-2"
            >
              Privacy
            </Link>
            .
          </p>
        </MetaTile>

        <div className="sm:col-span-2 rounded-lg border border-signal/20 bg-signal/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Data retention</p>
          <p className="mt-1 text-muted-foreground">
            Evidence is kept for audit after disconnect or org deletion; mutable
            records are removed with the organization. Details in{" "}
            <Link
              href="/legal/privacy"
              className="text-foreground underline underline-offset-2"
            >
              Privacy
            </Link>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "review";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        tone === "review"
          ? "border-status-review/30 bg-status-review/10 text-status-review"
          : "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      <span className="font-medium text-foreground">{value}</span>
      {label}
    </span>
  );
}
