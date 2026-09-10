/** Groups findings that share a common technical cause. */
export interface FindingCluster {
  id: string;
  label: string;
  checkId: string;
  /** Shared path prefix or file pattern, e.g. "components/" or "ProductCard.tsx". */
  sharedLocation: string;
  findingIds: string[];
  controlIds: string[];
  /** How many open findings this cluster covers. */
  occurrenceCount?: number;
  /** Priority score (higher = fix first). */
  priorityScore?: number;
}
