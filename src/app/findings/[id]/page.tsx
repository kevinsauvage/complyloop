import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { aiExplanationAvailable } from "@/ai/explainer";
import {
  ConfidenceBadge,
  ProvenanceBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { DeveloperHandoffCard } from "@/components/developer-handoff";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card, CodeBlock, PageHeader, formatDateTime } from "@/components/ui";
import { remediationStatusLabel } from "@/core/labels";
import type { Finding, Remediation, RemediationStatus } from "@/core/types";
import {
  applyRemediationAction,
  approveRemediationAction,
  dismissFindingAction,
  generateAiExplanationAction,
  generateAiRemediationAction,
  manualVerifyRemediationAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "@/server/actions";
import { buildDeveloperHandoff } from "@/server/handoff";
import { projectCapabilities } from "@/server/project-capabilities";
import { resolveVisibleFinding } from "@/server/project-visibility";
import { controlById, getWorkspace, remediationForFinding } from "@/server/workspace";

export const dynamic = "force-dynamic";

const LIFECYCLE: RemediationStatus[] = [
  "detected",
  "investigating",
  "suggested",
  "approved",
  "implemented",
  "verified",
];

const primaryButton =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700";
const secondaryButton =
  "rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50";

function ActionPanel({
  finding,
  remediation,
  canRemediate,
}: {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
}) {
  if (!canRemediate && remediation.status !== "verified") {
    return (
      <PermissionNotice>
        You have view-only access on this project. Ask a member or admin to
        approve, apply, or verify remediations.
      </PermissionNotice>
    );
  }

  switch (remediation.status) {
    case "detected":
    case "investigating":
      return (
        <p className="text-sm text-zinc-500">
          No automated fix template yet. Generate an AI remediation suggestion,
          fix the code manually, or dismiss the finding with a documented reason.
        </p>
      );
    case "suggested": {
      const editable =
        finding.fix?.kind === "insert_attribute" && finding.fix.editable
          ? finding.fix
          : null;
      return (
        <StatefulActionForm
          action={approveRemediationAction.bind(null, finding.id)}
          submitLabel="Approve remediation"
          submitClassName={primaryButton}
          className="flex flex-col gap-3"
        >
          {editable ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              {editable.attribute} value (review before approving)
              <input
                type="text"
                name="value"
                defaultValue={editable.value}
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          ) : null}
        </StatefulActionForm>
      );
    }
    case "approved":
      return (
        <div className="flex flex-col gap-3">
          {finding.fix ? (
            <StatefulActionForm
              action={applyRemediationAction.bind(null, finding.id)}
              submitLabel="Apply change to the file"
              pendingLabel="Applying…"
              submitClassName={primaryButton}
              confirmMessage="Apply this change to the project file on disk? This writes to the workspace."
            />
          ) : null}
          <StatefulActionForm
            action={markRemediationImplementedAction.bind(null, finding.id)}
            submitLabel="Mark as implemented"
            submitClassName={secondaryButton}
            className="flex flex-col gap-2"
          >
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Or mark implemented (applied outside ComplyLoop)
              <input
                type="text"
                name="note"
                placeholder="e.g. Fixed in PR #42"
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          </StatefulActionForm>
        </div>
      );
    case "implemented":
      return (
        <div className="flex flex-col gap-4">
          <StatefulActionForm
            action={verifyRemediationAction.bind(null, finding.id)}
            submitLabel="Verify fix (automated re-check)"
            pendingLabel="Verifying…"
            submitClassName={primaryButton}
          />
          <StatefulActionForm
            action={manualVerifyRemediationAction.bind(null, finding.id)}
            submitLabel="Verify manually"
            submitClassName={secondaryButton}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3"
          >
            <p className="text-sm text-zinc-600">
              Manual verification — use when the automated check cannot confirm
              the fix (or after verifying by other means). Requires a note.
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Verification note
              <textarea
                name="note"
                required
                rows={2}
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          </StatefulActionForm>
        </div>
      );
    case "verified":
      return (
        <p className="text-sm font-medium text-emerald-700">
          {finding.resolvedNote ??
            "Fix verified: the automated check no longer fails on this file."}
        </p>
      );
    default: {
      const _exhaustive: never = remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export default async function FindingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, access } = await getWorkspace();
  const resolved = resolveVisibleFinding(
    id,
    db.findings,
    db.projects,
    access,
  );
  if (!resolved) notFound();
  const { finding, project } = resolved;
  const caps = projectCapabilities(project, access);

  const control = controlById(db, finding.controlId);
  const remediation = remediationForFinding(db, finding.id);
  const evidence = db.evidence
    .filter((record) => record.findingId === finding.id)
    .reverse();
  const aiAvailable = aiExplanationAvailable();
  const handoff = buildDeveloperHandoff(project, control, finding, remediation);
  const showHandoff =
    remediation.suggestion !== null || finding.fix !== null;
  const canCreatePr =
    caps.canRemediate &&
    Boolean(finding.fix) &&
    fs.existsSync(path.join(project.rootPath, ".git"));

  return (
    <>
      <PageHeader
        title={`${control.code} — ${control.title}`}
        description={`${control.secondaryCode} · ${control.description}`}
      >
        <Link href="/findings" className="text-sm text-zinc-500 hover:underline">
          ← All findings
        </Link>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <ConfidenceBadge confidence={finding.confidence} />
        <RemediationStatusBadge status={remediation.status} />
        {finding.status === "dismissed" && finding.dismissal ? (
          <span className="text-sm text-zinc-500">
            Dismissed ({finding.dismissal.reason.replace(/_/g, " ")}):{" "}
            {finding.dismissal.note || "no note"}
          </span>
        ) : null}
        {finding.status === "resolved" && finding.resolvedNote ? (
          <span className="text-sm text-emerald-700">{finding.resolvedNote}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <Card title="Where">
          <p className="mb-2 font-mono text-xs text-zinc-500">
            {finding.location.filePath}:{finding.location.line}:
            {finding.location.column}
          </p>
          <CodeBlock>{finding.location.snippet}</CodeBlock>
        </Card>

        <Card title="Explanation">
          <p className="mb-3 text-xs text-zinc-500">
            Deterministic baseline is always present. AI explanations are optional
            enrichment and never set compliance status.
          </p>
          {finding.explanations.map((explanation, index) => (
            <div
              key={`${explanation.provenance}-${explanation.generatedAt}-${index}`}
              className={index > 0 ? "mt-5 border-t border-zinc-100 pt-5" : undefined}
            >
              <div className="mb-3 flex items-center gap-2">
                <ProvenanceBadge provenance={explanation.provenance} />
                {explanation.model ? (
                  <span className="text-xs text-zinc-400">{explanation.model}</span>
                ) : null}
              </div>
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="font-medium text-zinc-900">Why it failed</dt>
                  <dd className="mt-0.5 text-zinc-600">{explanation.whyItFailed}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-900">Impact</dt>
                  <dd className="mt-0.5 text-zinc-600">{explanation.impact}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-900">How to fix</dt>
                  <dd className="mt-0.5 text-zinc-600">{explanation.howToFix}</dd>
                </div>
              </dl>
            </div>
          ))}
          {finding.status === "open" && caps.canRemediate ? (
            <form
              action={generateAiExplanationAction.bind(null, finding.id)}
              className="mt-4"
            >
              <button
                type="submit"
                disabled={!aiAvailable}
                className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Generate AI explanation
              </button>
              {!aiAvailable ? (
                <p className="mt-1 text-xs text-zinc-400">
                  Set <code className="font-mono">AI_GATEWAY_API_KEY</code> to
                  enrich with AI. The deterministic explanation above remains the
                  happy-path baseline.
                </p>
              ) : null}
            </form>
          ) : null}
        </Card>

        <Card title="Remediation">
          <ol className="mb-4 flex flex-wrap items-center gap-1 text-xs">
            {LIFECYCLE.map((status, index) => {
              const reached = LIFECYCLE.indexOf(remediation.status) >= index;
              return (
                <li key={status} className="flex items-center gap-1">
                  {index > 0 ? <span className="text-zinc-300">→</span> : null}
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      reached
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {remediationStatusLabel(status)}
                  </span>
                </li>
              );
            })}
          </ol>

          {remediation.suggestion ? (
            <div className="mb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ProvenanceBadge
                  provenance={remediation.suggestion.provenance ?? "deterministic"}
                />
                {remediation.suggestion.confidence ? (
                  <ConfidenceBadge confidence={remediation.suggestion.confidence} />
                ) : null}
                {remediation.suggestion.model ? (
                  <span className="text-xs text-zinc-400">
                    {remediation.suggestion.model}
                  </span>
                ) : null}
              </div>
              <p className="mb-2 text-sm text-zinc-600">
                {remediation.suggestion.description}
              </p>
              <CodeBlock>{remediation.suggestion.proposedSnippet}</CodeBlock>
            </div>
          ) : null}

          {finding.status === "open" &&
          caps.canRemediate &&
          (remediation.status === "detected" ||
            remediation.status === "suggested") ? (
            <form
              action={generateAiRemediationAction.bind(null, finding.id)}
              className="mb-4"
            >
              <button
                type="submit"
                disabled={!aiAvailable}
                className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {remediation.suggestion
                  ? "Refine with AI remediation"
                  : "Generate AI remediation"}
              </button>
              {!aiAvailable ? (
                <p className="mt-1 text-xs text-zinc-400">
                  Without AI credentials, use the deterministic suggestion (when
                  present) or fix manually and mark implemented after approval.
                </p>
              ) : null}
            </form>
          ) : null}

          {finding.status === "open" || remediation.status === "verified" ? (
            <ActionPanel
              finding={finding}
              remediation={remediation}
              canRemediate={caps.canRemediate}
            />
          ) : null}

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-zinc-500">
              History ({remediation.history.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
              {remediation.history.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  {formatDateTime(entry.at)} — {remediationStatusLabel(entry.status)}
                  {entry.note ? `: ${entry.note}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </Card>

        {showHandoff ? (
          <DeveloperHandoffCard
            handoff={handoff}
            findingId={finding.id}
            canCreatePr={canCreatePr}
          />
        ) : null}

        {finding.status === "open" && caps.canRemediate ? (
          <Card title="Dismiss this finding">
            <StatefulActionForm
              action={dismissFindingAction.bind(null, finding.id)}
              submitLabel="Dismiss finding"
              submitClassName={secondaryButton}
              className="flex flex-col gap-3"
              confirmMessage="Dismiss this finding? The reason and note are kept as evidence."
            >
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                Reason
                <select
                  name="reason"
                  className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
                >
                  <option value="false_positive">False positive</option>
                  <option value="not_applicable">Not applicable</option>
                  <option value="accepted_risk">Accepted risk</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                Note (kept as evidence)
                <textarea
                  name="note"
                  rows={2}
                  className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
                />
              </label>
            </StatefulActionForm>
          </Card>
        ) : null}

        <Card title="Evidence trail">
          {evidence.length === 0 ? (
            <p className="text-sm text-zinc-500">No evidence recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {evidence.map((record) => (
                <li key={record.id} className="text-sm text-zinc-600">
                  {record.summary}
                  <span className="ml-2 text-xs text-zinc-400">
                    {formatDateTime(record.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
