import { and, count, eq, inArray } from "drizzle-orm";
import type { DrizzleDb } from "../postgres.ts";
import { alerts, findings } from "../schema.ts";

export interface NavAttentionCounts {
  openFindings: number;
  unreadAlerts: number;
}

/** Nav badge counts without loading the full findings/alerts slice. */
export async function countNavAttentionForProject(
  drizzle: DrizzleDb,
  projectId: string,
  scopedControlIds?: readonly string[],
): Promise<NavAttentionCounts> {
  const openFindingFilter =
    scopedControlIds && scopedControlIds.length > 0
      ? and(
          eq(findings.projectId, projectId),
          eq(findings.status, "open"),
          inArray(findings.controlId, [...scopedControlIds]),
        )
      : and(eq(findings.projectId, projectId), eq(findings.status, "open"));

  const [findingsRow, alertsRow] = await Promise.all([
    drizzle.select({ value: count() }).from(findings).where(openFindingFilter),
    drizzle
      .select({ value: count() })
      .from(alerts)
      .where(and(eq(alerts.projectId, projectId), eq(alerts.read, false))),
  ]);

  return {
    openFindings: Number(findingsRow[0]?.value ?? 0),
    unreadAlerts: Number(alertsRow[0]?.value ?? 0),
  };
}