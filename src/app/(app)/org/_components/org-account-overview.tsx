import Link from "next/link";

import type { OrgRole } from "@complyloop/analysis-core/contract/project-types";

import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import {
  LedgerFact,
  LedgerStrip,
} from "@/components/primitives/page-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { STATUS_TONE_BADGE } from "@/core/display/report-tones";
import { roleTone } from "@/core/display/status";
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
          <h2 className="font-heading text-base font-medium leading-snug">
            Account
          </h2>
          <Badge variant="outline">Early access pilot</Badge>
          {viewerRole ? (
            <Badge
              className={cn(
                "capitalize",
                STATUS_TONE_BADGE[roleTone(viewerRole)],
              )}
            >
              {viewerRole}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Ownership, plan, and how this workspace&apos;s data is retained.
          Billing and self-serve plans are not enabled yet for this pilot.
        </CardDescription>
      </CardHeader>
      <LedgerStrip
        label="Organization details"
        className="sm:grid-cols-2 lg:grid-cols-3"
      >
        <LedgerFact label="Organization">
          <p className="font-medium text-foreground">{orgName}</p>
          <p className="font-mono text-xs text-muted-foreground">{orgSlug}</p>
        </LedgerFact>
        <LedgerFact label="Projects" valueClassName="font-mono tabular-nums">
          {projectCount}
        </LedgerFact>
        <LedgerFact label="Members" valueClassName="font-mono tabular-nums">
          {memberCount}
          {pendingInviteCount > 0 ? (
            <span className="ml-2 font-sans text-xs text-status-review">
              {pendingInviteCount} pending invite
              {pendingInviteCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </LedgerFact>
        <LedgerFact label="Organization owner">
          <p className="font-medium text-foreground">
            {ownerGithubLogin ? `@${ownerGithubLogin}` : "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            Controls export, deletion, and admin roles. Ownership transfer is
            not supported yet.
          </p>
        </LedgerFact>
        <LedgerFact label="Plan & support">
          <p className="text-sm text-muted-foreground">
            Manually provisioned. Seat and project quotas are not enforced in
            product yet.
          </p>
          {supportEmail ? (
            <>
              <a
                href={`mailto:${supportEmail}`}
                className="mt-1 block font-medium text-foreground underline underline-offset-4"
              >
                {supportEmail}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                Export and delete from this page. Assisted deletion within 30
                days — see{" "}
                <Link
                  href="/legal/privacy"
                  className="text-foreground underline underline-offset-2"
                >
                  Privacy
                </Link>
                .
              </p>
            </>
          ) : null}
        </LedgerFact>
        <LedgerFact label="Workspace age">
          <p className="text-foreground">
            Created <FormattedDateTime iso={createdAt} />
          </p>
        </LedgerFact>
      </LedgerStrip>
      <CardContent>
        <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
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
