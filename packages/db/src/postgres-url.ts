import dns from "node:dns/promises";
import postgres from "postgres";
import {
  isDatabaseSslInsecureEnabled,
  resolvePostgresSslOptions,
} from "./postgres-ssl.ts";

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
  options: { max?: number; debug?: boolean } = {},
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

  const debug = options.debug ?? process.env.NODE_ENV !== "production";
  const client = postgres({
    host,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl,
    max: options.max ?? 3,
    // Release idle sockets so free-tier slot limits recover after spikes.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    prepare: false,
    ...(debug
      ? {
          debug: (_connection: number, query: string, parameters: unknown[]) => {
            // Skip postgres.js internal type/bootstrap queries (pg_type arrays).
            if (/select .*pg_catalog|posix|--|\bselect 1\b/i.test(query)) return;
            console.log(
              JSON.stringify({
                severity: "debug",
                message: "db query",
                query: compactSql(query),
                args: compactArgs(parameters),
                at: new Date().toISOString(),
              }),
            );
          },
        }
      : {}),
  });

  // Fail early with a actionable TLS / capacity hint (Aiven private CA is common).
  try {
    await client`select 1`;
  } catch (error) {
    await client.end({ timeout: 1 }).catch(() => undefined);
    throw wrapPostgresConnectError(error, allowInsecureSsl);
  }

  return client;
}

function wrapPostgresConnectError(
  error: unknown,
  allowInsecureSsl: boolean,
): Error {
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
  const looksLikeSlotExhaustion =
    /remaining connection slots|too many connections|maxclientsreached/i.test(
      combined,
    );

  if (looksLikeTls && !allowInsecureSsl) {
    return new Error(
      `Postgres TLS certificate verification failed (${message}). ` +
        `Providers with a private CA (e.g. Aiven) need either their CA configured ` +
        `or, for local/dev only, DATABASE_SSL_INSECURE=true.`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  if (looksLikeSlotExhaustion) {
    return new Error(
      `Postgres connection slots exhausted (${message}). ` +
        `Restart the Next.js dev server to drop leaked pools, wait a minute for ` +
        `idle connections to close, or raise the plan/connection limit on the host.`,
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

const MAX_SQL = 300;
const MAX_ARGS = 8;

/** Collapse whitespace and cap length so dev logs stay one-readable-line. */
function compactSql(query: string): string {
  const oneLine = query.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_SQL ? `${oneLine.slice(0, MAX_SQL)}…` : oneLine;
}

/** Cap parameter list; cardinality is the interesting part, not each value. */
function compactArgs(args: unknown[]): unknown[] {
  const shown = args.slice(0, MAX_ARGS);
  return args.length > MAX_ARGS
    ? [...shown, `… ${args.length - MAX_ARGS} more`]
    : shown;
}
