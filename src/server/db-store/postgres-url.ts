import dns from "node:dns/promises";
import postgres from "postgres";
import {
  isDatabaseSslInsecureEnabled,
  resolvePostgresSslOptions,
} from "./postgres-ssl";

/**
 * Opens a postgres.js client from DATABASE_URL.
 * If the OS resolver NXDOMAINs the host (common right after Aiven create),
 * falls back to public DNS and connects by IP with the original TLS servername.
 *
 * TLS: `sslmode=require` verifies the server certificate by default. Set
 * `DATABASE_SSL_INSECURE=true` only when you intentionally skip CA verification
 * (e.g. temporary Aiven CA until `sslrootcert` is configured).
 */
export async function createPostgresClient(
  connectionString: string,
  options: { max?: number } = {},
): Promise<ReturnType<typeof postgres>> {
  const parsed = new URL(connectionString);
  const hostname = parsed.hostname;
  const host = await resolveHostname(hostname);

  const allowInsecureSsl = isDatabaseSslInsecureEnabled();
  const ssl = resolvePostgresSslOptions({
    sslmode: parsed.searchParams.get("sslmode"),
    hostname,
    allowInsecureSsl,
  });

  const client = postgres({
    host,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl,
    max: options.max ?? 10,
    prepare: false,
  });

  // Fail early with a actionable TLS hint (Aiven private CA is a common case).
  try {
    await client`select 1`;
  } catch (error) {
    await client.end({ timeout: 1 }).catch(() => undefined);
    throw wrapPostgresTlsError(error, allowInsecureSsl);
  }

  return client;
}

function wrapPostgresTlsError(error: unknown, allowInsecureSsl: boolean): Error {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && "cause" in error
      ? error.cause
      : undefined;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  const combined = `${message} ${causeMessage}`;
  const looksLikeTls =
    /SELF_SIGNED_CERT|unable to verify|certificate/i.test(combined);

  if (looksLikeTls && !allowInsecureSsl) {
    return new Error(
      `Postgres TLS certificate verification failed (${message}). ` +
        `Providers with a private CA (e.g. Aiven) need either their CA configured ` +
        `or, for local/dev only, DATABASE_SSL_INSECURE=true.`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return error instanceof Error ? error : new Error(message);
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
