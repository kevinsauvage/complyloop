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

function Badge({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const label = requirementStatusLabel(status);
  switch (status) {
    case "passed":
      return <Badge className="bg-emerald-100 text-emerald-800">{label}</Badge>;
    case "failed":
      return <Badge className="bg-red-100 text-red-800">{label}</Badge>;
    case "needs_review":
      return <Badge className="bg-amber-100 text-amber-800">{label}</Badge>;
    case "not_applicable":
      return <Badge className="bg-zinc-100 text-zinc-600">{label}</Badge>;
    case "unable_to_verify":
      return <Badge className="bg-violet-100 text-violet-800">{label}</Badge>;
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
      return <Badge className="bg-zinc-100 text-zinc-600">{label}</Badge>;
    case "investigating":
      return <Badge className="bg-sky-100 text-sky-800">{label}</Badge>;
    case "suggested":
      return <Badge className="bg-blue-100 text-blue-800">{label}</Badge>;
    case "approved":
      return <Badge className="bg-indigo-100 text-indigo-800">{label}</Badge>;
    case "implemented":
      return <Badge className="bg-violet-100 text-violet-800">{label}</Badge>;
    case "verified":
      return <Badge className="bg-emerald-100 text-emerald-800">{label}</Badge>;
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
      return <Badge className="bg-red-100 text-red-800">{label}</Badge>;
    case "serious":
      return <Badge className="bg-orange-100 text-orange-800">{label}</Badge>;
    case "moderate":
      return <Badge className="bg-amber-100 text-amber-800">{label}</Badge>;
    case "minor":
      return <Badge className="bg-zinc-100 text-zinc-600">{label}</Badge>;
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  switch (confidence) {
    case "high":
      return <Badge className="bg-zinc-100 text-zinc-700">Confidence: high</Badge>;
    case "medium":
      return <Badge className="bg-zinc-100 text-zinc-700">Confidence: medium</Badge>;
    case "low":
      return <Badge className="bg-zinc-100 text-zinc-700">Confidence: low</Badge>;
    default: {
      const _exhaustive: never = confidence;
      throw new Error(`Unhandled confidence: ${_exhaustive}`);
    }
  }
}

export function DeterminationBadge({ method }: { method: DeterminationMethod }) {
  switch (method) {
    case "automated":
      return <Badge className="bg-cyan-100 text-cyan-800">Automated</Badge>;
    case "human_review":
      return <Badge className="bg-fuchsia-100 text-fuchsia-800">Human review</Badge>;
    default: {
      const _exhaustive: never = method;
      throw new Error(`Unhandled determination: ${_exhaustive}`);
    }
  }
}

export function ProvenanceBadge({ provenance }: { provenance: ExplanationProvenance }) {
  switch (provenance) {
    case "deterministic":
      return <Badge className="bg-cyan-100 text-cyan-800">Deterministic</Badge>;
    case "ai":
      return <Badge className="bg-fuchsia-100 text-fuchsia-800">AI-generated</Badge>;
    default: {
      const _exhaustive: never = provenance;
      throw new Error(`Unhandled provenance: ${_exhaustive}`);
    }
  }
}
