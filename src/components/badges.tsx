import { Badge } from "@/components/ui/badge";
import {
  remediationStatusLabel,
  requirementStatusLabel,
  severityLabel,
} from "@/core/labels";
import type {
  Confidence,
  DeterminationMethod,
  ExplanationProvenance,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "@/core/statuses";
import type { AssessmentEngine } from "@/core/finding-types";
import { cn } from "@/lib/utils";

/** Soft tint + readable text; stronger fill in dark mode for contrast. */
const tint = {
  passed:
    "border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25",
  failed:
    "border-transparent bg-status-failed/15 text-status-failed dark:bg-status-failed/25",
  review:
    "border-transparent bg-status-review/15 text-status-review dark:bg-status-review/25",
  na: "border-transparent bg-status-na/15 text-status-na dark:bg-status-na/25",
  unverifiable:
    "border-transparent bg-status-unverifiable/15 text-status-unverifiable dark:bg-status-unverifiable/25",
  signal: "border-transparent bg-signal/15 text-signal dark:bg-signal/25",
} as const;

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const label = requirementStatusLabel(status);
  switch (status) {
    case "passed":
      return <Badge className={tint.passed}>{label}</Badge>;
    case "failed":
      return <Badge className={tint.failed}>{label}</Badge>;
    case "needs_review":
      return <Badge className={tint.review}>{label}</Badge>;
    case "not_applicable":
      return <Badge className={tint.na}>{label}</Badge>;
    case "unable_to_verify":
      return <Badge className={tint.unverifiable}>{label}</Badge>;
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function RemediationStatusBadge({ status }: { status: RemediationStatus }) {
  const label = remediationStatusLabel(status);
  switch (status) {
    case "detected":
      return <Badge variant="secondary">{label}</Badge>;
    case "investigating":
      return (
        <Badge className="border-transparent bg-sky-500/15 text-sky-700 dark:bg-sky-400/25 dark:text-sky-300">
          {label}
        </Badge>
      );
    case "suggested":
      return <Badge className={tint.signal}>{label}</Badge>;
    case "approved":
      return (
        <Badge className="border-transparent bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/25 dark:text-indigo-300">
          {label}
        </Badge>
      );
    case "implemented":
      return <Badge className={tint.unverifiable}>{label}</Badge>;
    case "verified":
      return <Badge className={tint.passed}>{label}</Badge>;
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const label = severityLabel(severity);
  switch (severity) {
    case "critical":
      return <Badge className={tint.failed}>{label}</Badge>;
    case "serious":
      return (
        <Badge className="border-transparent bg-orange-500/15 text-orange-700 dark:bg-orange-400/25 dark:text-orange-300">
          {label}
        </Badge>
      );
    case "moderate":
      return <Badge className={tint.review}>{label}</Badge>;
    case "minor":
      return <Badge variant="secondary">{label}</Badge>;
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <Badge variant="outline" className={cn("text-muted-foreground")}>
      Confidence: {confidence}
    </Badge>
  );
}

export function DeterminationBadge({ method }: { method: DeterminationMethod }) {
  switch (method) {
    case "automated":
      return <Badge className={tint.signal}>Automated</Badge>;
    case "human_review":
      return (
        <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/25 dark:text-fuchsia-300">
          Human review
        </Badge>
      );
    default: {
      const _exhaustive: never = method;
      throw new Error(`Unhandled determination: ${_exhaustive}`);
    }
  }
}

export function ProvenanceBadge({ provenance }: { provenance: ExplanationProvenance }) {
  switch (provenance) {
    case "deterministic":
      return <Badge className={tint.signal}>Deterministic</Badge>;
    case "ai":
      return (
        <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/25 dark:text-fuchsia-300">
          AI-generated
        </Badge>
      );
    default: {
      const _exhaustive: never = provenance;
      throw new Error(`Unhandled provenance: ${_exhaustive}`);
    }
  }
}

/** Which analysis engine produced a finding (AST source vs rendered DOM). */
export function EngineBadge({ engine }: { engine: AssessmentEngine }) {
  switch (engine) {
    case "ast":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Source (AST)
        </Badge>
      );
    case "runtime":
      return (
        <Badge className="border-transparent bg-teal-500/15 text-teal-700 dark:bg-teal-400/25 dark:text-teal-300">
          Runtime (DOM)
        </Badge>
      );
    default: {
      const _exhaustive: never = engine;
      throw new Error(`Unhandled assessment engine: ${_exhaustive}`);
    }
  }
}
