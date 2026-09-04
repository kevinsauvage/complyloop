import type { AnalyzerContribution, AnalyzerId, RawFinding } from "../types.ts";

const ANALYZER_PRIORITY: Record<AnalyzerId, number> = {
  axe: 0,
  "html-validate": 1,
  "playwright-custom": 2,
  "site-level": 3,
  linkinator: 4,
  ast: 5,
  "jsx-a11y": 6,
};

function effectiveAnalyzerId(finding: RawFinding): AnalyzerId {
  if (finding.analyzerId) return finding.analyzerId;
  if (finding.engine === "ast") return "ast";
  return "axe";
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Stable key for collapsing dom/runtime findings on the same node. */
export function runtimeFindingLocationKey(finding: RawFinding): string | null {
  const location = finding.location;
  if (location.kind === "site") return null;
  if (location.kind === "dom") {
    return `${location.url}::${finding.checkId}::${normalizeSnippet(location.snippet)}`;
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
      const winnerPriority = ANALYZER_PRIORITY[effectiveAnalyzerId(winner)];
      const candidatePriority = ANALYZER_PRIORITY[effectiveAnalyzerId(candidate)];
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
