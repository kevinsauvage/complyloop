import "server-only";

import dns from "node:dns/promises";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

/**
 * Maps libpq-style sslmode to postgres.js TLS options.
 * `require` / `prefer` encrypt **and** verify the server certificate by default.
 * Opt out only with an explicit insecure flag (documented for Aiven-style CAs
 * until `sslrootcert` is wired).
 */
export function resolvePostgresSslOptions(input: {
  sslmode: string | null;
  hostname: string;
  allowInsecureSsl: boolean;
}): { rejectUnauthorized: boolean; servername: string } | undefined {
  const mode = input.sslmode?.toLowerCase() ?? null;
  if (!mode || mode === "disable" || mode === "allow") {
    return undefined;
  }

  if (
    mode !== "require" &&
    mode !== "prefer" &&
    mode !== "verify-ca" &&
    mode !== "verify-full"
  ) {
    return undefined;
  }

  const mustVerify = mode === "verify-ca" || mode === "verify-full";
  const rejectUnauthorized = mustVerify ? true : !input.allowInsecureSsl;

  return {
    rejectUnauthorized,
    servername: input.hostname,
  };
}

export function isDatabaseSslInsecureEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.DATABASE_SSL_INSECURE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

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
    database:
      decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
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
          debug: (
            _connection: number,
            query: string,
            parameters: unknown[],
          ) => {
            // Skip postgres.js internal type/bootstrap queries (pg_type arrays).
            if (/select .*pg_catalog|posix|--|\bselect 1\b/i.test(query))
              return;
            console.log(
              `\x1b[90m${new Date().toISOString()}\x1b[0m \x1b[90mDBG\x1b[0m db query\x1b[90m query\x1b[0m=${compactSql(query)} \x1b[90margs\x1b[0m=${compactArgs(parameters).length}`,
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
    error instanceof Error && "cause" in error ? error.cause : undefined;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  const combined = `${message} ${causeMessage}`;
  const looksLikeTls = /SELF_SIGNED_CERT|unable to verify|certificate/i.test(
    combined,
  );
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

export type DrizzleDb = PostgresJsDatabase<typeof schema>;

/**
 * Free-tier Postgres (Neon/Aiven) often allows ~20 connections with a few
 * reserved for superuser. Keep the pool small.
 */
const POOL_MAX = 3;

type GlobalDb = {
  __complyloopSql?: ReturnType<typeof postgres> | null;
  __complyloopDb?: DrizzleDb | null;
  __complyloopInit?: Promise<DrizzleDb> | null;
};

/** Survive Turbopack/HMR so we do not leak a new pool on every reload. */
const globalForDb = globalThis as typeof globalThis & GlobalDb;

/** Lazy singleton for the app process (and across HMR in dev). */
export async function getDrizzle(): Promise<DrizzleDb> {
  if (globalForDb.__complyloopDb) return globalForDb.__complyloopDb;
  if (!globalForDb.__complyloopInit) {
    globalForDb.__complyloopInit = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) {
        throw new Error("DATABASE_URL is not set.");
      }
      globalForDb.__complyloopSql = await createPostgresClient(url, {
        max: POOL_MAX,
      });
      globalForDb.__complyloopDb = drizzle(globalForDb.__complyloopSql, {
        schema,
      });
      return globalForDb.__complyloopDb;
    })().catch((error) => {
      // Allow a later request to retry after a transient pool/slot failure.
      globalForDb.__complyloopInit = null;
      throw error;
    });
  }
  return globalForDb.__complyloopInit;
}

/** Test helper — closes the pool. */
export async function closeDrizzle(): Promise<void> {
  if (globalForDb.__complyloopSql) {
    await globalForDb.__complyloopSql.end({ timeout: 5 });
  }
  globalForDb.__complyloopSql = null;
  globalForDb.__complyloopDb = null;
  globalForDb.__complyloopInit = null;
}

/** Serialize interactive writes and assessment apply for one project. */
export function projectWriteLockKey(projectId: string): string {
  return `project-write:${projectId}`;
}

/** Serialize a user's org-scoped writes (membership/org row mutations). */
export function orgWriteLockKey(userId: string): string {
  return `org-write:${userId}`;
}

/** Holds until the surrounding transaction commits or rolls back. */
export async function acquireNamedPostgresAdvisoryLock(
  tx: DrizzleDb,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/** Per-resource advisory lock (e.g. rate-limit buckets). */
export async function withNamedPostgresAdvisoryLock<T>(
  drizzle: DrizzleDb,
  key: string,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, key);
    return fn(tx);
  });
}
