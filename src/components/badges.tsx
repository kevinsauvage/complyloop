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
} from "@complyloop/analysis-core/contract/statuses";
import type { AssessmentEngine, EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { EVIDENCE_TONE_BADGE, evidenceTone } from "@/core/evidence-tone";
import { STATUS_TONE_BADGE, statusTone } from "@/core/status-tone";
import { cn } from "@/lib/utils";

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const label = requirementStatusLabel(status);
  return (
    <BadgeWithDescription description={requirementStatusDescription(status)}>
      <Badge className={STATUS_TONE_BADGE[statusTone(status)]}>{label}</Badge>
    </BadgeWithDescription>
  );
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
          <Badge className={STATUS_TONE_BADGE.signal}>{label}</Badge>
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
          <Badge className={STATUS_TONE_BADGE.unverifiable}>{label}</Badge>
        </BadgeWithDescription>
      );
    case "verified":
      return (
        <BadgeWithDescription description={remediationStatusDescription(status)}>
          <Badge className={STATUS_TONE_BADGE.passed}>{label}</Badge>
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
          <Badge className={STATUS_TONE_BADGE.failed}>{label}</Badge>
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
          <Badge className={STATUS_TONE_BADGE.review}>{label}</Badge>
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
          <Badge className={STATUS_TONE_BADGE.signal}>Automated</Badge>
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
          <Badge className={STATUS_TONE_BADGE.signal}>Deterministic</Badge>
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
