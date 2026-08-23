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

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const label = requirementStatusLabel(status);
  switch (status) {
    case "passed":
      return (
        <Badge className="border-transparent bg-status-passed/15 text-status-passed">
          {label}
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">{label}</Badge>;
    case "needs_review":
      return (
        <Badge className="border-transparent bg-status-review/15 text-status-review">
          {label}
        </Badge>
      );
    case "not_applicable":
      return <Badge variant="secondary">{label}</Badge>;
    case "unable_to_verify":
      return (
        <Badge className="border-transparent bg-status-unverifiable/15 text-status-unverifiable">
          {label}
        </Badge>
      );
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
        <Badge className="border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400">
          {label}
        </Badge>
      );
    case "suggested":
      return (
        <Badge className="border-transparent bg-signal/15 text-signal">
          {label}
        </Badge>
      );
    case "approved":
      return (
        <Badge className="border-transparent bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
          {label}
        </Badge>
      );
    case "implemented":
      return (
        <Badge className="border-transparent bg-status-unverifiable/15 text-status-unverifiable">
          {label}
        </Badge>
      );
    case "verified":
      return (
        <Badge className="border-transparent bg-status-passed/15 text-status-passed">
          {label}
        </Badge>
      );
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
      return <Badge variant="destructive">{label}</Badge>;
    case "serious":
      return (
        <Badge className="border-transparent bg-orange-500/15 text-orange-600 dark:text-orange-400">
          {label}
        </Badge>
      );
    case "moderate":
      return (
        <Badge className="border-transparent bg-status-review/15 text-status-review">
          {label}
        </Badge>
      );
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
      return (
        <Badge className="border-transparent bg-signal/15 text-signal">
          Automated
        </Badge>
      );
    case "human_review":
      return (
        <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400">
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
      return (
        <Badge className="border-transparent bg-signal/15 text-signal">
          Deterministic
        </Badge>
      );
    case "ai":
      return (
        <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400">
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
        <Badge className="border-transparent bg-teal-500/15 text-teal-600 dark:text-teal-400">
          Runtime (DOM)
        </Badge>
      );
    default: {
      const _exhaustive: never = engine;
      throw new Error(`Unhandled assessment engine: ${_exhaustive}`);
    }
  }
}
