/** Pure ops-threshold checks for `npm run ops:check`; dependency-free so `scripts/operations-check.ts` and tests share it. */

export interface OpsSignals {
  /** Jobs in `queued`/`running` (same count `/api/health` reports). */
  queuedJobs: number;
  /** Age (ms) of the oldest `queued` job, or `null` if none; a single stale job is the only signal when the dispatch token is missing or the drain stopped. */
  oldestQueuedJobAgeMs: number | null;
  /** `pg_total_relation_size('evidence')` in bytes. */
  evidenceBytes: number;
  /** `pg_class.reltuples` estimate for `evidence` (no seq scan). */
  evidenceRowsEstimate: number;
}

export interface OpsThresholds {
  maxQueuedJobs: number;
  /** Fail when the oldest queued job is older than this (stalled-drain alarm). */
  maxQueuedJobAgeMs: number;
  maxEvidenceBytes: number;
}

export interface OpsEvaluation {
  ok: boolean;
  failures: string[];
}

export const DEFAULT_OPS_THRESHOLDS: OpsThresholds = {
  maxQueuedJobs: 50,
  // 20 min: past the 15-min schedule backstop, so a normal dispatch delay never trips it but a stalled drain does.
  maxQueuedJobAgeMs: 20 * 60 * 1000,
  maxEvidenceBytes: 1024 * 1024 * 1024,
};

/** MB shorthand for the `OPS_MAX_EVIDENCE_MB` env override. */
export function evidenceBytesFromMb(mb: number): number {
  return mb * 1024 * 1024;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${bytes} B`;
}

function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  return minutes >= 60
    ? `${(minutes / 60).toFixed(1)} h`
    : `${Math.round(minutes)} min`;
}

/** Fail-closed: every breached threshold is a failure so the workflow alerts; odd input fails explicitly rather than passing silently. */
export function evaluateOpsStatus(
  signals: OpsSignals,
  thresholds: OpsThresholds = DEFAULT_OPS_THRESHOLDS,
): OpsEvaluation {
  const failures: string[] = [];

  if (!Number.isSafeInteger(signals.queuedJobs) || signals.queuedJobs < 0) {
    failures.push(`queuedJobs is not a usable count: ${signals.queuedJobs}.`);
  } else if (signals.queuedJobs > thresholds.maxQueuedJobs) {
    failures.push(
      `queuedJobs ${signals.queuedJobs} exceeds max ${thresholds.maxQueuedJobs} — ` +
        "the dispatch/schedule drain stopped keeping up.",
    );
  }

  const { oldestQueuedJobAgeMs } = signals;
  if (oldestQueuedJobAgeMs !== null) {
    if (!Number.isFinite(oldestQueuedJobAgeMs) || oldestQueuedJobAgeMs < 0) {
      failures.push(
        `oldestQueuedJobAgeMs is not a usable duration: ${oldestQueuedJobAgeMs}.`,
      );
    } else if (oldestQueuedJobAgeMs > thresholds.maxQueuedJobAgeMs) {
      failures.push(
        `oldest queued assessment job is ${formatDuration(oldestQueuedJobAgeMs)} old ` +
          `(max ${formatDuration(thresholds.maxQueuedJobAgeMs)}) — the drain stalled; ` +
          "jobs are not being picked up (check GH_WORKER_DISPATCH_TOKEN and the worker schedule).",
      );
    }
  }

  if (
    !Number.isSafeInteger(signals.evidenceBytes) ||
    signals.evidenceBytes < 0
  ) {
    failures.push(
      `evidenceBytes is not a usable count: ${signals.evidenceBytes}.`,
    );
  } else if (signals.evidenceBytes > thresholds.maxEvidenceBytes) {
    failures.push(
      `evidence size ${formatBytes(signals.evidenceBytes)} ` +
        `(${signals.evidenceRowsEstimate} rows est.) exceeds max ` +
        `${formatBytes(thresholds.maxEvidenceBytes)} — ` +
        "review retention (docs/vercel.md §6) before the table degrades the database.",
    );
  }

  return { ok: failures.length === 0, failures };
}
