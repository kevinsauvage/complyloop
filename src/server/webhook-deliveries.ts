import fs from "node:fs";
import path from "node:path";

interface DeliveryStore {
  /** delivery id → ISO timestamp when processed */
  deliveries: Record<string, string>;
}

const MAX_DELIVERIES = 2000;

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
}

function storePath(): string {
  return path.join(dataDir(), "webhook-deliveries.json");
}

function loadStore(): DeliveryStore {
  if (!fs.existsSync(storePath())) return { deliveries: {} };
  try {
    return JSON.parse(fs.readFileSync(storePath(), "utf8")) as DeliveryStore;
  } catch {
    return { deliveries: {} };
  }
}

function saveStore(store: DeliveryStore): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

function prune(store: DeliveryStore): void {
  const entries = Object.entries(store.deliveries).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  if (entries.length <= MAX_DELIVERIES) return;
  const keep = entries.slice(entries.length - MAX_DELIVERIES);
  store.deliveries = Object.fromEntries(keep);
}

/** Returns true when this GitHub delivery id was already processed. */
export function hasProcessedWebhookDelivery(deliveryId: string): boolean {
  if (!deliveryId) return false;
  return deliveryId in loadStore().deliveries;
}

export function recordWebhookDelivery(deliveryId: string): void {
  if (!deliveryId) return;
  const store = loadStore();
  store.deliveries[deliveryId] = new Date().toISOString();
  prune(store);
  saveStore(store);
}
