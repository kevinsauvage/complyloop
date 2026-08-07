import {
  ConfidenceBadge,
  ProvenanceBadge,
} from "@/components/badges";
import { Card, CodeBlock, formatDateTime } from "@/components/ui";
import { remediationStatusLabel } from "@/core/labels";
import type { Finding, Remediation, RemediationStatus } from "@/core/types";
import { generateAiRemediationAction } from "@/server/actions/remediation-ai";
import { FindingActionPanel } from "./finding-action-panel";
import { secondaryButton } from "./finding-styles";

const LIFECYCLE: RemediationStatus[] = [
  "detected",
  "investigating",
  "suggested",
  "approved",
  "implemented",
  "verified",
];

export function FindingRemediationCard({
  finding,
  remediation,
  canRemediate,
  aiAvailable,
}: {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  aiAvailable: boolean;
}) {
  return (
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
                    : "bg-zinc-100 text-zinc-500"
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
              <span className="text-xs text-zinc-500">
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
      canRemediate &&
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
            <p className="mt-1 text-xs text-zinc-500">
              Without AI credentials, use the deterministic suggestion (when
              present) or fix manually and mark implemented after approval.
            </p>
          ) : null}
        </form>
      ) : null}

      {finding.status === "open" || remediation.status === "verified" ? (
        <FindingActionPanel
          finding={finding}
          remediation={remediation}
          canRemediate={canRemediate}
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
  );
}
