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
} from "@/core/types";
import { cn } from "@/lib/utils";

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const label = requirementStatusLabel(status);
  switch (status) {
    case "passed":
      return (
        <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">
          {label}
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">{label}</Badge>;
    case "needs_review":
      return (
        <Badge className="border-transparent bg-amber-500/15 text-amber-400">
          {label}
        </Badge>
      );
    case "not_applicable":
      return <Badge variant="secondary">{label}</Badge>;
    case "unable_to_verify":
      return (
        <Badge className="border-transparent bg-violet-500/15 text-violet-400">
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
        <Badge className="border-transparent bg-sky-500/15 text-sky-400">
          {label}
        </Badge>
      );
    case "suggested":
      return (
        <Badge className="border-transparent bg-blue-500/15 text-blue-400">
          {label}
        </Badge>
      );
    case "approved":
      return (
        <Badge className="border-transparent bg-indigo-500/15 text-indigo-400">
          {label}
        </Badge>
      );
    case "implemented":
      return (
        <Badge className="border-transparent bg-violet-500/15 text-violet-400">
          {label}
        </Badge>
      );
    case "verified":
      return (
        <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">
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
        <Badge className="border-transparent bg-orange-500/15 text-orange-400">
          {label}
        </Badge>
      );
    case "moderate":
      return (
        <Badge className="border-transparent bg-amber-500/15 text-amber-400">
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
        <Badge className="border-transparent bg-cyan-500/15 text-cyan-400">
          Automated
        </Badge>
      );
    case "human_review":
      return (
        <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-400">
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
        <Badge className="border-transparent bg-cyan-500/15 text-cyan-400">
          Deterministic
        </Badge>
      );
    case "ai":
      return (
        <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-400">
          AI-generated
        </Badge>
      );
    default: {
      const _exhaustive: never = provenance;
      throw new Error(`Unhandled provenance: ${_exhaustive}`);
    }
  }
}
