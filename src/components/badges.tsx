"use client";

import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  statusToneBadgeClass,
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

function BadgeWithDescription({
  description,
  children,
}: {
  description: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-pretty">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  const display = requirementStatusDisplay(status);
  return (
    <BadgeWithDescription description={display.description}>
      <Badge className={STATUS_TONE_BADGE[display.tone]}>{display.label}</Badge>
    </BadgeWithDescription>
  );
}

export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  const display = evidenceDisplay(kind);
  const tintClass = EVIDENCE_TONE_BADGE[display.tone];
  return (
    <Badge
      variant={display.tone === "default" ? "secondary" : undefined}
      className={cn(tintClass)}
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
    <BadgeWithDescription description={display.description}>
      <Badge
        variant={display.badgeVariant}
        className={cn(statusToneBadgeClass(display.tone))}
      >
        {display.label}
      </Badge>
    </BadgeWithDescription>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const display = severityDisplay(severity);
  return (
    <BadgeWithDescription description={display.description}>
      <Badge
        variant={display.badgeVariant}
        className={cn(statusToneBadgeClass(display.tone))}
      >
        {display.label}
      </Badge>
    </BadgeWithDescription>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <BadgeWithDescription description={confidenceDisplay(confidence).description}>
      <Badge variant="outline" className="text-muted-foreground">
        Confidence: {confidence}
      </Badge>
    </BadgeWithDescription>
  );
}

export function DeterminationBadge({
  method,
}: {
  method: DeterminationMethod;
}) {
  const display = determinationDisplay(method);
  return (
    <BadgeWithDescription description={display.description}>
      <Badge className={STATUS_TONE_BADGE[display.tone]}>{display.label}</Badge>
    </BadgeWithDescription>
  );
}

export function ProvenanceBadge({
  provenance,
}: {
  provenance: ExplanationProvenance;
}) {
  const display = provenanceDisplay(provenance);
  return (
    <BadgeWithDescription description={display.description}>
      <Badge className={STATUS_TONE_BADGE[display.tone]}>{display.label}</Badge>
    </BadgeWithDescription>
  );
}

/** Which analysis engine produced a finding (AST source vs rendered DOM). */
export function EngineBadge({ engine }: { engine: AssessmentEngine }) {
  const display = engineDisplay(engine);
  return (
    <BadgeWithDescription description={display.description}>
      <Badge
        variant={display.badgeVariant}
        className={cn(
          statusToneBadgeClass(display.tone),
          display.badgeVariant === "outline" && "text-muted-foreground",
        )}
      >
        {display.label}
      </Badge>
    </BadgeWithDescription>
  );
}
