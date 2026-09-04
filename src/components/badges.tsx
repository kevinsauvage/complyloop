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

const REMEDIATION_BADGE: Record<RemediationStatus, string> = {
  detected: "",
  suggested: STATUS_TONE_BADGE.signal,
  approved:
    "border-transparent bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/25 dark:text-indigo-300",
  implemented: STATUS_TONE_BADGE.unverifiable,
  verified: STATUS_TONE_BADGE.passed,
};

const REMEDIATION_VARIANT: Record<RemediationStatus, "secondary" | undefined> = {
  detected: "secondary",
  suggested: undefined,
  approved: undefined,
  implemented: undefined,
  verified: undefined,
};

export function RemediationStatusBadge({ status }: { status: RemediationStatus }) {
  return (
    <BadgeWithDescription description={remediationStatusDescription(status)}>
      <Badge variant={REMEDIATION_VARIANT[status]} className={cn(REMEDIATION_BADGE[status] || undefined)}>
        {remediationStatusLabel(status)}
      </Badge>
    </BadgeWithDescription>
  );
}

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: STATUS_TONE_BADGE.failed,
  serious:
    "border-transparent bg-orange-500/15 text-orange-700 dark:bg-orange-400/25 dark:text-orange-300",
  moderate: STATUS_TONE_BADGE.review,
  minor: "",
};

const SEVERITY_VARIANT: Record<Severity, "secondary" | undefined> = {
  critical: undefined,
  serious: undefined,
  moderate: undefined,
  minor: "secondary",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <BadgeWithDescription description={severityDescription(severity)}>
      <Badge variant={SEVERITY_VARIANT[severity]} className={cn(SEVERITY_BADGE[severity] || undefined)}>
        {severityLabel(severity)}
      </Badge>
    </BadgeWithDescription>
  );
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

const DETERMINATION_BADGE: Record<DeterminationMethod, { className: string; label: string }> = {
  automated: { className: STATUS_TONE_BADGE.signal, label: "Automated" },
  human_review: {
    className:
      "border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/25 dark:text-fuchsia-300",
    label: "Human review",
  },
};

export function DeterminationBadge({ method }: { method: DeterminationMethod }) {
  const { className, label } = DETERMINATION_BADGE[method];
  return (
    <BadgeWithDescription description={determinationDescription(method)}>
      <Badge className={className}>{label}</Badge>
    </BadgeWithDescription>
  );
}

const PROVENANCE_BADGE: Record<ExplanationProvenance, { className: string; label: string }> = {
  deterministic: { className: STATUS_TONE_BADGE.signal, label: "Deterministic" },
  ai: {
    className:
      "border-transparent bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-400/25 dark:text-fuchsia-300",
    label: "AI-generated",
  },
};

export function ProvenanceBadge({ provenance }: { provenance: ExplanationProvenance }) {
  const { className, label } = PROVENANCE_BADGE[provenance];
  return (
    <BadgeWithDescription description={provenanceDescription(provenance)}>
      <Badge className={className}>{label}</Badge>
    </BadgeWithDescription>
  );
}

const ENGINE_BADGE: Record<AssessmentEngine, { variant: "outline" | undefined; className: string; label: string }> = {
  ast: { variant: "outline", className: "text-muted-foreground", label: "Source (AST)" },
  runtime: {
    variant: undefined,
    className:
      "border-transparent bg-teal-500/15 text-teal-700 dark:bg-teal-400/25 dark:text-teal-300",
    label: "Runtime (DOM)",
  },
};

/** Which analysis engine produced a finding (AST source vs rendered DOM). */
export function EngineBadge({ engine }: { engine: AssessmentEngine }) {
  const { variant, className, label } = ENGINE_BADGE[engine];
  return (
    <BadgeWithDescription description={engineDescription(engine)}>
      <Badge variant={variant} className={className}>{label}</Badge>
    </BadgeWithDescription>
  );
}
