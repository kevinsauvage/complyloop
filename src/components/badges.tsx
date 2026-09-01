"use client";

import { BadgeWithDescription } from "@/components/badge-with-description";
import { Badge } from "@/components/ui/badge";
import {
  confidenceDescription,
  determinationDescription,
  engineDescription,
  provenanceDescription,
  remediationStatusDescription,
  requirementStatusDescription,
  severityDescription,
} from "@/core/badge-descriptions";
import {
  evidenceKindLabel,
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
import type { EvidenceKind } from "@/core/finding-types";
import { EVIDENCE_TONE_BADGE, evidenceTone } from "@/core/evidence-tone";
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
      return (
        <BadgeWithDescription description={requirementStatusDescription(status)}>
          <Badge className={tint.passed}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "failed":
      return (
        <BadgeWithDescription description={requirementStatusDescription(status)}>
          <Badge className={tint.failed}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "needs_review":
      return (
        <BadgeWithDescription description={requirementStatusDescription(status)}>
          <Badge className={tint.review}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "not_applicable":
      return (
        <BadgeWithDescription description={requirementStatusDescription(status)}>
          <Badge className={tint.na}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "unable_to_verify":
      return (
        <BadgeWithDescription description={requirementStatusDescription(status)}>
          <Badge className={tint.unverifiable}>{label}</Badge>
        </BadgeWithDescription>
      );
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  const tone = evidenceTone(kind);
  const label = evidenceKindLabel(kind);
  const tintClass = EVIDENCE_TONE_BADGE[tone];
  return (
    <Badge
      variant={tone === "default" ? "secondary" : undefined}
      className={cn(tintClass || undefined)}
    >
      {label}
    </Badge>
  );
}

export function RemediationStatusBadge({ status }: { status: RemediationStatus }) {
  const label = remediationStatusLabel(status);
  switch (status) {
    case "detected":
      return (
        <BadgeWithDescription description={remediationStatusDescription(status)}>
          <Badge variant="secondary">{label}</Badge>
        </BadgeWithDescription>
      );
    case "suggested":
      return (
        <BadgeWithDescription description={remediationStatusDescription(status)}>
          <Badge className={tint.signal}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "approved":
      return (
        <BadgeWithDescription description={remediationStatusDescription(status)}>
          <Badge className="border-transparent bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/25 dark:text-indigo-300">
            {label}
          </Badge>
        </BadgeWithDescription>
      );
    case "implemented":
      return (
        <BadgeWithDescription description={remediationStatusDescription(status)}>
          <Badge className={tint.unverifiable}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "verified":
      return (
        <BadgeWithDescription description={remediationStatusDescription(status)}>
          <Badge className={tint.passed}>{label}</Badge>
        </BadgeWithDescription>
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
      return (
        <BadgeWithDescription description={severityDescription(severity)}>
          <Badge className={tint.failed}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "serious":
      return (
        <BadgeWithDescription description={severityDescription(severity)}>
          <Badge className="border-transparent bg-orange-500/15 text-orange-700 dark:bg-orange-400/25 dark:text-orange-300">
            {label}
          </Badge>
        </BadgeWithDescription>
      );
    case "moderate":
      return (
        <BadgeWithDescription description={severityDescription(severity)}>
          <Badge className={tint.review}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "minor":
      return (
        <BadgeWithDescription description={severityDescription(severity)}>
          <Badge variant="secondary">{label}</Badge>
        </BadgeWithDescription>
      );
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <BadgeWithDescription description={confidenceDescription(confidence)}>
      <Badge variant="outline" className={cn("text-muted-foreground")}>
        Confidence: {confidence}
      </Badge>
    </BadgeWithDescription>
  );
}

export function DeterminationBadge({ method }: { method: DeterminationMethod }) {
  switch (method) {
    case "automated":
      return (
        <BadgeWithDescription description={determinationDescription(method)}>
          <Badge className={tint.signal}>Automated</Badge>
        </BadgeWithDescription>
      );
    case "human_review":
      return (
        <BadgeWithDescription description={determinationDescription(method)}>
          <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/25 dark:text-fuchsia-300">
            Human review
          </Badge>
        </BadgeWithDescription>
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
        <BadgeWithDescription description={provenanceDescription(provenance)}>
          <Badge className={tint.signal}>Deterministic</Badge>
        </BadgeWithDescription>
      );
    case "ai":
      return (
        <BadgeWithDescription description={provenanceDescription(provenance)}>
          <Badge className="border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/25 dark:text-fuchsia-300">
            AI-generated
          </Badge>
        </BadgeWithDescription>
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
        <BadgeWithDescription description={engineDescription(engine)}>
          <Badge variant="outline" className="text-muted-foreground">
            Source (AST)
          </Badge>
        </BadgeWithDescription>
      );
    case "runtime":
      return (
        <BadgeWithDescription description={engineDescription(engine)}>
          <Badge className="border-transparent bg-teal-500/15 text-teal-700 dark:bg-teal-400/25 dark:text-teal-300">
            Runtime (DOM)
          </Badge>
        </BadgeWithDescription>
      );
    default: {
      const _exhaustive: never = engine;
      throw new Error(`Unhandled assessment engine: ${_exhaustive}`);
    }
  }
}
