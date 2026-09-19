import type { ReactNode } from "react";

import type { EvidenceKind } from "@complyloop/analysis-core/contract/entities";
import type {
  Confidence,
  ExplanationProvenance,
  FindingStatus,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";

import { BadgeWithDescription } from "@/components/badge-with-description";
import { Badge } from "@/components/ui/badge";
import {
  type BadgeVariant,
  confidenceDisplay,
  EVIDENCE_TONE_BADGE,
  evidenceDisplay,
  findingStatusDisplay,
  provenanceDisplay,
  remediationStatusDisplay,
  requirementStatusDisplay,
  severityDisplay,
  STATUS_TONE_BADGE,
  type StatusTone,
} from "@/core/display";
import { cn } from "@/lib/utils";

export { BadgeWithDescription };

/**
 * The single status badge renderer — every status surface is
 * label + description + tone, fed from the unified `@/core/display` tables.
 */
export function StatusBadge({
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
          // Outline + tone (Serious, Detected) must read as an outline, not a
          // fill: the tone map's translucent background would otherwise make
          // them identical to their filled counterparts.
          variant === "outline" && tone ? "border-current bg-transparent" : "",
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
    <StatusBadge
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
    <StatusBadge
      description={display.description}
      label={display.label}
      variant={display.badgeVariant}
      tone={display.tone}
    />
  );
}

/** Finding lifecycle status (Open / Resolved / Dismissed) — the axis the tabs filter on. */
export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  const display = findingStatusDisplay(status);
  return (
    <StatusBadge
      description={display.description}
      label={display.label}
      tone={display.tone}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const display = severityDisplay(severity);
  return (
    <StatusBadge
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
    <StatusBadge
      description={display.description}
      label={`Confidence: ${confidence}`}
      variant="outline"
      muted
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
    <StatusBadge
      description={display.description}
      label={display.label}
      tone={display.tone}
    />
  );
}
