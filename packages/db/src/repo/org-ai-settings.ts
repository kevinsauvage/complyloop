import { desc, eq, sql } from "drizzle-orm";

import type { DrizzleDb } from "../postgres.ts";
import { orgAiSettings, orgAiSettingsEvents } from "../schema.ts";

/**
 * Stored org AI Gateway configuration. The key is an encrypted envelope:
 * sealing and opening live in `src/server/ai/secret-box.ts`.
 */
export interface OrgAiSettingsRow {
  orgId: string;
  model: string;
  iv: string;
  tag: string;
  ciphertext: string;
  /** Last four characters of the API key, for display only. */
  keyLast4: string;
  updatedBy: string;
  updatedAt: string;
}

export async function findOrgAiSettings(
  db: DrizzleDb,
  orgId: string,
): Promise<OrgAiSettingsRow | undefined> {
  const rows = await db
    .select()
    .from(orgAiSettings)
    .where(eq(orgAiSettings.orgId, orgId))
    .limit(1);
  return rows[0];
}

export async function upsertOrgAiSettings(
  db: DrizzleDb,
  row: OrgAiSettingsRow,
): Promise<void> {
  await db.insert(orgAiSettings).values(row).onConflictDoUpdate({
    target: orgAiSettings.orgId,
    set: row,
  });
}

export async function deleteOrgAiSettings(
  db: DrizzleDb,
  orgId: string,
): Promise<void> {
  await db.delete(orgAiSettings).where(eq(orgAiSettings.orgId, orgId));
}

/** Ops signal: stored keys exist, so the encryption secret is required. */
export async function countOrgAiSettings(db: DrizzleDb): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orgAiSettings);
  return row?.count ?? 0;
}

const EVENT_ACTIONS = ["configured", "removed"] as const;

type OrgAiEventAction = (typeof EVENT_ACTIONS)[number];

function eventAction(value: string): OrgAiEventAction {
  const action = EVENT_ACTIONS.find((candidate) => candidate === value);
  if (!action) throw new Error(`Unknown stored AI event action: ${value}`);
  return action;
}

export interface OrgAiSettingsEventRow {
  id: string;
  orgId: string;
  at: string;
  /** GitHub login or user id of the admin. */
  actor: string;
  action: OrgAiEventAction;
  model: string | null;
}

export async function insertOrgAiSettingsEvent(
  db: DrizzleDb,
  row: OrgAiSettingsEventRow,
): Promise<void> {
  await db.insert(orgAiSettingsEvents).values(row);
}

export async function listOrgAiSettingsEvents(
  db: DrizzleDb,
  orgId: string,
  limit = 20,
): Promise<OrgAiSettingsEventRow[]> {
  const rows = await db
    .select()
    .from(orgAiSettingsEvents)
    .where(eq(orgAiSettingsEvents.orgId, orgId))
    .orderBy(desc(orgAiSettingsEvents.at))
    .limit(limit);
  return rows.map((row) => ({ ...row, action: eventAction(row.action) }));
}
