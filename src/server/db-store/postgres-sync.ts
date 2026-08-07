/**
 * Replace-all sync for a payload table: empty → delete all; otherwise upsert
 * then prune rows whose ids are no longer in memory.
 */
export async function syncPayloadTable(input: {
  length: number;
  deleteAll: () => Promise<unknown>;
  upsert: () => Promise<unknown>;
  prune: () => Promise<unknown>;
}): Promise<void> {
  if (input.length === 0) {
    await input.deleteAll();
    return;
  }
  await input.upsert();
  await input.prune();
}
