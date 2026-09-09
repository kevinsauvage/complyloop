import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BadgeWithDescription } from "@/components/badge-with-description";
import {
  confidenceDisplay,
  determinationDisplay,
  engineDisplay,
  evidenceDisplay,
  EVIDENCE_TONE_BADGE,
  provenanceDisplay,
  remediationStatusDisplay,
  requirementStatusDisplay,
  severityDisplay,
  STATUS_TONE_BADGE,
  type BadgeVariant,
  type StatusTone,
} from "@/core/status-display";
import type {
  Confidence,
  DeterminationMethod,
  ExplanationProvenance,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";
import type { EvidenceKind } from "@complyloop/db/types";
import type { AssessmentEngine } from "@complyloop/analysis-core/contract/finding-types";
import { cn } from "@/lib/utils";

/** Single badge renderer — all status badges are label + description + tone. */
function DescribedBadge({
  description,
  label,
  variant,
  tone,
  muted = false,
}: {
  description: string;
  label: ReactNode;
  variant?: BadgeVariant;
  tone?: StatusTone | null;
  muted?: boolean;
}) {
  return (
    <BadgeWithDescription description={description}>
      <Badge
        variant={variant}
        className={cn(
          tone ? STATUS_TONE_BADGE[tone] : "",
          muted && "text-muted-foreground",
        )}
      >
        {label}
      </Badge>
    </BadgeWithDescription>
  );
}

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  const display = requirementStatusDisplay(status);
  return (
    <DescribedBadge
      description={display.description}
      label={display.label}
      tone={display.tone}
    />
  );
}

export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  const display = evidenceDisplay(kind);
  return (
    <Badge
      variant={display.tone === "default" ? "secondary" : undefined}
      className={EVIDENCE_TONE_BADGE[display.tone]}
    >
      {display.label}
    </Badge>
  );
}

export function RemediationStatusBadge({
  status,
}: {
  status: RemediationStatus;
}) {
  const display = remediationStatusDisplay(status);
  return (
    <DescribedBadge
      description={display.description}
      label={display.label}
      variant={display.badgeVariant}
      tone={display.tone}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const display = severityDisplay(severity);
  return (
    <DescribedBadge
      description={display.description}
      label={display.label}
      variant={display.badgeVariant}
      tone={display.tone}
    />
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const display = confidenceDisplay(confidence);
  return (
    <DescribedBadge
      description={display.description}
      label={`Confidence: ${confidence}`}
      variant="outline"
      muted
    />
  );
}

export function DeterminationBadge({
  method,
}: {
  method: DeterminationMethod;
}) {
  const display = determinationDisplay(method);
  return (
    <DescribedBadge
      description={display.description}
      label={display.label}
      tone={display.tone}
    />
  );
}

export function ProvenanceBadge({
  provenance,
}: {
  provenance: ExplanationProvenance;
}) {
  const display = provenanceDisplay(provenance);
  return (
    <DescribedBadge
      description={display.description}
      label={display.label}
      tone={display.tone}
    />
  );
}

/** Which analysis engine produced a finding (AST source vs rendered DOM). */
export function EngineBadge({ engine }: { engine: AssessmentEngine }) {
  const display = engineDisplay(engine);
  return (
    <DescribedBadge
      description={display.description}
      label={display.label}
      variant={display.badgeVariant}
      tone={display.tone}
      muted={display.badgeVariant === "outline"}
    />
  );
}
