import dns from "node:dns/promises";
import postgres from "postgres";

/**
 * Opens a postgres.js client from DATABASE_URL.
 * If the OS resolver NXDOMAINs the host (common right after Aiven create),
 * falls back to public DNS and connects by IP with the original TLS servername.
 */
export async function createPostgresClient(
  connectionString: string,
  options: { max?: number } = {},
): Promise<ReturnType<typeof postgres>> {
  const parsed = new URL(connectionString);
  const hostname = parsed.hostname;
  const host = await resolveHostname(hostname);

  // Aiven uses its own CA; `sslmode=require` means encrypt. Full CA verify
  // needs their downloaded cert (`verify-full` / `sslrootcert`).
  const sslmode = parsed.searchParams.get("sslmode");
  const ssl =
    sslmode === "require" || sslmode === "prefer"
      ? { rejectUnauthorized: false as const, servername: hostname }
      : sslmode === "verify-full" || sslmode === "verify-ca"
        ? { rejectUnauthorized: true as const, servername: hostname }
        : undefined;

  return postgres({
    host,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl,
    max: options.max ?? 10,
    prepare: false,
  });
}

async function resolveHostname(hostname: string): Promise<string> {
  try {
    const result = await dns.lookup(hostname);
    return result.address;
  } catch {
    const resolver = new dns.Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1"]);
    const addresses = await resolver.resolve4(hostname);
    const ip = addresses[0];
    if (!ip) {
      throw new Error(`Could not resolve database host: ${hostname}`);
    }
    return ip;
  }
}
