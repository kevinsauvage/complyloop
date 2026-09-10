import type { AnalyzerContribution, AnalyzerId } from "../contract/finding-types.ts";
import { ANALYZER_META } from "../contract/finding-types.ts";
import { normalizeSnippetKey } from "./dom-location.ts";
import type { RawFinding } from "../types.ts";

function analyzerPriority(id: AnalyzerId): number {
  return ANALYZER_META[id].priority;
}

function effectiveAnalyzerId(finding: RawFinding): AnalyzerId {
  if (finding.analyzerId) return finding.analyzerId;
  // Runtime-dedupe only sees runtime findings, which always name an analyzer;
  // default to ast for hand-built fixtures.
  return "ast";
}

function normalizeSnippet(snippet: string): string {
  return normalizeSnippetKey(snippet);
}

/** Stable key for collapsing dom/runtime findings on the same node. */
function runtimeFindingLocationKey(finding: RawFinding): string | null {
  const location = finding.location;
  if (location.kind === "site") return null;
  if (location.kind === "dom") {
    // Two distinct nodes can share a snippet (identical markup), so the node
    // selector is part of node identity. Fall back to the snippet only when
    // no usable selector is reported.
    const selector =
      location.selector && location.selector !== "(unknown)"
        ? normalizeSnippet(location.selector)
        : "";
    return `${location.url}::${finding.checkId}::${selector}::${normalizeSnippet(location.snippet)}`;
  }
  return null;
}

function contributionKey(entry: AnalyzerContribution): string {
  return `${entry.analyzerId}::${entry.analyzerRuleId ?? ""}`;
}

function contributionFromFinding(finding: RawFinding): AnalyzerContribution {
  return {
    analyzerId: effectiveAnalyzerId(finding),
    ...(finding.analyzerRuleId ? { analyzerRuleId: finding.analyzerRuleId } : {}),
    ...(finding.analyzerVersion ? { analyzerVersion: finding.analyzerVersion } : {}),
  };
}

function mergeContributors(
  winner: RawFinding,
  loser: RawFinding,
): AnalyzerContribution[] {
  const merged = new Map<string, AnalyzerContribution>();
  for (const entry of winner.contributingAnalyzers ?? []) {
    merged.set(contributionKey(entry), entry);
  }
  for (const entry of loser.contributingAnalyzers ?? []) {
    merged.set(contributionKey(entry), entry);
  }

  const loserPrimary = contributionFromFinding(loser);
  const winnerPrimary = contributionFromFinding(winner);
  if (contributionKey(loserPrimary) !== contributionKey(winnerPrimary)) {
    merged.set(contributionKey(loserPrimary), loserPrimary);
  }

  return [...merged.values()];
}

/**
 * Collapses runtime findings that share a check id and dom node.
 * Priority: axe > html-validate > playwright-custom. html-validate and axe
 * do not overlap on check ids (exclusive ownership).
 * Site-level findings are never merged with dom findings.
 */
export function dedupeRuntimeFindings(
  findings: ReadonlyArray<RawFinding>,
): RawFinding[] {
  const passthrough: RawFinding[] = [];
  const groups = new Map<string, RawFinding[]>();

  for (const finding of findings) {
    const key = runtimeFindingLocationKey(finding);
    if (!key) {
      passthrough.push(finding);
      continue;
    }
    const bucket = groups.get(key) ?? [];
    bucket.push(finding);
    groups.set(key, bucket);
  }

  const deduped: RawFinding[] = [...passthrough];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]!);
      continue;
    }

    let winner = group[0]!;
    for (let index = 1; index < group.length; index += 1) {
      const candidate = group[index]!;
      const winnerPriority = analyzerPriority(effectiveAnalyzerId(winner));
      const candidatePriority = analyzerPriority(effectiveAnalyzerId(candidate));
      if (candidatePriority < winnerPriority) {
        winner = {
          ...candidate,
          contributingAnalyzers: mergeContributors(candidate, winner),
        };
      } else {
        winner = {
          ...winner,
          contributingAnalyzers: mergeContributors(winner, candidate),
        };
      }
    }
    deduped.push(winner);
  }

  return deduped;
}
