import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import {
  isSiteLocation,
  isSourceLocation,
} from "@complyloop/analysis-core/contract/location";

import { humanizeReasonSlug } from "./display/status";
import {
  hasSafeDeterministicFix,
  verifiedDescription,
} from "./remediation-lifecycle";

/**
 * Finding-page UX beat model: maps finding + remediation state to a single
 * call-to-action. UI policy — a pure view over `remediation-lifecycle.ts`
 * (which owns all transitions), never a second state machine: it persists
 * nothing and advances nothing. The assessment worker and batch paths must
 * never import this module (enforced by ESLint on `src/server/assessment*`).
 */

export interface FindingActInput {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  prUrl: string | null;
  aiAvailable: boolean;
  patchReady: boolean;
  githubConnected: boolean;
}

type FindingActBase = {
  title: string;
  description: string;
  showDismiss: boolean;
  showHandoff: boolean;
};

export type FindingActView =
  | (FindingActBase & {
      beat: "source_generate";
      generateLabel: "Generate patch" | "Verify and prepare patch";
      canGenerate: boolean;
    })
  | (FindingActBase & {
      beat: "source_review";
      showCreatePr: boolean;
      showReplacePatch: boolean;
    })
  | (FindingActBase & { beat: "source_in_review"; prUrl: string })
  | (FindingActBase & { beat: "runtime_generate"; canGenerate: boolean })
  | (FindingActBase & { beat: "runtime_approve" })
  | (FindingActBase & { beat: "runtime_implement" })
  | (FindingActBase & { beat: "runtime_verify" })
  | (FindingActBase & { beat: "verified" })
  | (FindingActBase & { beat: "dismissed" })
  | (FindingActBase & { beat: "view_only" });

function canGenerateSourcePatch(
  finding: Finding,
  aiAvailable: boolean,
  githubConnected: boolean,
): boolean {
  return githubConnected && (hasSafeDeterministicFix(finding) || aiAvailable);
}

function chrome(input: FindingActInput): {
  showDismiss: boolean;
  showHandoff: boolean;
} {
  return {
    showDismiss:
      input.finding.status === "open" &&
      input.canRemediate &&
      input.remediation.status !== "verified",
    showHandoff:
      input.prUrl === null &&
      input.finding.status === "open" &&
      (input.remediation.suggestion !== null || input.finding.fix !== null),
  };
}

function runtimeAct(input: FindingActInput): FindingActView {
  // Site findings have no call site and no PR: verification is a site
  // re-audit. Beats stay shared with DOM (the actions are identical); only
  // the wording branches.
  const site = isSiteLocation(input.finding.location);
  switch (input.remediation.status) {
    case "detected":
      return {
        ...chrome(input),
        beat: "runtime_generate",
        title: site ? "Fix across the site" : "Fix at the call site",
        description: site
          ? "Propose a fix for this site-wide pattern — it appears on multiple pages, not one element."
          : "Propose a fix where this element is rendered — not a generic change to a shared component.",
        canGenerate: input.aiAvailable,
      };
    case "suggested":
      return {
        ...chrome(input),
        beat: "runtime_approve",
        title: "Review guidance",
        description: "Approve this suggestion, then implement it in your app.",
      };
    case "approved":
      return {
        ...chrome(input),
        beat: "runtime_implement",
        title: "Implemented outside ComplyLoop",
        description: site
          ? "After you ship the site-wide fix, mark it implemented."
          : "After you ship the call-site fix, mark it implemented.",
      };
    case "implemented":
      return {
        ...chrome(input),
        beat: "runtime_verify",
        title: site ? "Confirm the site is fixed" : "Confirm the page is fixed",
        description: site
          ? "Re-run the runtime audit to confirm the pattern is gone site-wide."
          : "Re-run the runtime audit to confirm the page is fixed.",
      };
    case "verified":
      return {
        ...chrome(input),
        beat: "verified",
        title: "Verified",
        description: verifiedDescription(input.finding),
      };
    default: {
      const _exhaustive: never = input.remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

function sourceGenerate(input: FindingActInput): FindingActView {
  const canGenerate = canGenerateSourcePatch(
    input.finding,
    input.aiAvailable,
    input.githubConnected,
  );
  const generateLabel = hasSafeDeterministicFix(input.finding)
    ? "Verify and prepare patch"
    : "Generate patch";
  let description =
    "One focused edit, then ComplyLoop must pass before you open a draft pull request.";
  if (!input.githubConnected) {
    description = "Connect a GitHub repository before generating a patch.";
  } else if (!canGenerate) {
    description = "AI patch generation isn't enabled for this workspace yet.";
  }
  return {
    ...chrome(input),
    beat: "source_generate",
    title: "Fix this finding",
    description,
    generateLabel,
    canGenerate,
  };
}

export function findingAct(input: FindingActInput): FindingActView {
  if (input.finding.status === "dismissed") {
    const dismissal = input.finding.dismissal;
    const rawReason =
      dismissal?.reason ? humanizeReasonSlug(dismissal.reason) : "documented exception";
    const reason = rawReason.charAt(0).toUpperCase() + rawReason.slice(1);
    const note = dismissal?.note ? `: ${dismissal.note}` : "";
    return {
      ...chrome(input),
      beat: "dismissed",
      title: "Dismissed — exception on record",
      description: `${reason}${note}`,
    };
  }

  if (
    input.finding.status === "resolved" ||
    input.remediation.status === "verified"
  ) {
    return {
      ...chrome(input),
      beat: "verified",
      title: "Verified",
      description: verifiedDescription(input.finding),
    };
  }

  if (!input.canRemediate) {
    return {
      ...chrome(input),
      beat: "view_only",
      title: "Fix this finding",
      description:
        "You have view-only access on this project. Ask a member or admin to generate patches or verify remediations.",
    };
  }

  if (isSourceLocation(input.finding.location)) {
    if (input.prUrl) {
      return {
        ...chrome(input),
        beat: "source_in_review",
        title: "In review on GitHub",
        description: "Merge the draft PR, then re-assessment will verify.",
        prUrl: input.prUrl,
      };
    }
    if (input.patchReady) {
      return {
        ...chrome(input),
        beat: "source_review",
        title: "Review patch",
        description: input.githubConnected
          ? "ComplyLoop passed. Create a draft pull request to apply this patch on GitHub."
          : "ComplyLoop passed. Connect a GitHub repository to open a draft pull request.",
        showCreatePr: input.githubConnected,
        showReplacePatch: canGenerateSourcePatch(
          input.finding,
          input.aiAvailable,
          input.githubConnected,
        ),
      };
    }
    return sourceGenerate(input);
  }

  return runtimeAct(input);
}
