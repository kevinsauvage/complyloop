import fs from "node:fs";
import path from "node:path";
import { asc, count, eq, inArray } from "drizzle-orm";
import { getDrizzle, isPostgresConfigured } from "./db-store/client";
import { webhookDeliveries } from "./db-store/schema";
import { withProcessWriteLock } from "./db-store/write-lock";

interface DeliveryStore {
  /** delivery id → ISO timestamp when claimed */
  deliveries: Record<string, string>;
}

const MAX_DELIVERIES = 2000;

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
}

function storePath(): string {
  return path.join(dataDir(), "webhook-deliveries.json");
}

function loadJsonStore(): DeliveryStore {
  if (!fs.existsSync(storePath())) return { deliveries: {} };
  try {
    return JSON.parse(fs.readFileSync(storePath(), "utf8")) as DeliveryStore;
  } catch {
    return { deliveries: {} };
  }
}

function saveJsonStore(store: DeliveryStore): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

function pruneJson(store: DeliveryStore): void {
  const entries = Object.entries(store.deliveries).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  if (entries.length <= MAX_DELIVERIES) return;
  const keep = entries.slice(entries.length - MAX_DELIVERIES);
  store.deliveries = Object.fromEntries(keep);
}

async function prunePostgres(): Promise<void> {
  const drizzle = await getDrizzle();
  const [{ total }] = await drizzle
    .select({ total: count() })
    .from(webhookDeliveries);
  if (total <= MAX_DELIVERIES) return;

  const overflow = total - MAX_DELIVERIES;
  const oldest = await drizzle
    .select({ deliveryId: webhookDeliveries.deliveryId })
    .from(webhookDeliveries)
    .orderBy(asc(webhookDeliveries.processedAt))
    .limit(overflow);
  if (oldest.length === 0) return;
  await drizzle
    .delete(webhookDeliveries)
    .where(
      inArray(
        webhookDeliveries.deliveryId,
        oldest.map((row) => row.deliveryId),
      ),
    );
}

/**
 * Atomically claim a GitHub delivery id for processing.
 * Returns true only for the first claimant; later callers get false (duplicate).
 * Empty ids cannot be deduped — always returns true.
 */
export async function claimWebhookDelivery(
  deliveryId: string,
): Promise<boolean> {
  if (!deliveryId) return true;

  const processedAt = new Date().toISOString();

  if (isPostgresConfigured()) {
    const drizzle = await getDrizzle();
    const inserted = await drizzle
      .insert(webhookDeliveries)
      .values({ deliveryId, processedAt })
      .onConflictDoNothing()
      .returning({ deliveryId: webhookDeliveries.deliveryId });
    if (inserted.length === 0) return false;
    await prunePostgres();
    return true;
  }

  return withProcessWriteLock(async () => {
    const store = loadJsonStore();
    if (deliveryId in store.deliveries) return false;
    store.deliveries[deliveryId] = processedAt;
    pruneJson(store);
    saveJsonStore(store);
    return true;
  });
}

/** Returns true when this GitHub delivery id was already claimed. */
export async function hasProcessedWebhookDelivery(
  deliveryId: string,
): Promise<boolean> {
  if (!deliveryId) return false;
  if (isPostgresConfigured()) {
    const drizzle = await getDrizzle();
    const rows = await drizzle
      .select({ deliveryId: webhookDeliveries.deliveryId })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.deliveryId, deliveryId))
      .limit(1);
    return rows.length > 0;
  }
  return deliveryId in loadJsonStore().deliveries;
}
