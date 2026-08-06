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
