import Link from "next/link";
import { formatDateTime } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { OrgRole } from "@/core/project-types";

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
}: {
  orgName: string;
  orgSlug: string;
  createdAt: string;
  ownerGithubLogin: string | null;
  viewerRole: OrgRole | null;
  projectCount: number;
  memberCount: number;
  pendingInviteCount: number;
  /** Optional pilot support address from `COMPLYLOOP_SUPPORT_EMAIL`. */
  supportEmail: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-base font-medium leading-snug">
            Account
          </h2>
          <Badge variant="secondary">Early access pilot</Badge>
        </div>
        <CardDescription>
          Ownership, plan, and how this workspace&apos;s data is retained.
          Billing and self-serve plans are not enabled yet for this pilot.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Organization
            </dt>
            <dd className="mt-1 font-medium text-foreground">{orgName}</dd>
            <dd className="font-mono text-xs text-muted-foreground">{orgSlug}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Workspace owner
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {ownerGithubLogin ? `@${ownerGithubLogin}` : "Unknown"}
            </dd>
            <dd className="text-xs text-muted-foreground">
              The owner controls export, deletion, and admin roles. Ownership
              transfer is not supported yet.
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Your role
            </dt>
            <dd className="mt-1 font-medium capitalize text-foreground">
              {viewerRole ?? "none"}
            </dd>
          </div>
        </dl>

        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Plan</dt>
            <dd className="mt-1 font-medium text-foreground">
              Early access pilot
            </dd>
            <dd className="text-xs text-muted-foreground">
              Manually provisioned. Seat and project quotas are not enforced in
              product yet.
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Workspace size
            </dt>
            <dd className="mt-1 text-foreground">
              {projectCount} project{projectCount === 1 ? "" : "s"} ·{" "}
              {memberCount} member{memberCount === 1 ? "" : "s"}
              {pendingInviteCount > 0
                ? ` · ${pendingInviteCount} pending invite${pendingInviteCount === 1 ? "" : "s"}`
                : ""}
            </dd>
            <dd className="text-xs text-muted-foreground">
              Created {formatDateTime(createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Support contact
            </dt>
            <dd className="mt-1 text-foreground">
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}`}
                  className="font-medium underline underline-offset-2"
                >
                  {supportEmail}
                </a>
              ) : (
                <span className="text-muted-foreground">
                  Your ComplyLoop pilot operator
                </span>
              )}
            </dd>
            <dd className="text-xs text-muted-foreground">
              Export and delete from this page. Assisted deletion requests are
              handled within 30 days — see{" "}
              <Link
                href="/legal/privacy"
                className="text-foreground underline underline-offset-2"
              >
                Privacy
              </Link>
              .
            </dd>
          </div>
        </dl>

        <div className="sm:col-span-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Data retention</p>
          <p className="mt-1 text-muted-foreground">
            Evidence is append-only and kept for audit history after project
            disconnect or organization deletion. Mutable records (requirements,
            assessments, findings, remediations, alerts) are removed with the
            organization. Sign-out clears your encrypted GitHub tokens.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
