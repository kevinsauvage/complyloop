import "server-only";

/**
 * HTTP transport auth for pure-JS git (isomorphic-git) — replaces the old
 * `git.ts` child-process env plumbing, which died with the `git` CLI on
 * serverless. The token travels per-request in an `Authorization` header and
 * is never persisted to repo config: GitHub's git endpoints expect the token
 * as the password of an HTTP Basic credential (`x-access-token:<token>`);
 * `Authorization: Bearer` is accepted by the REST API but rejected by
 * git-over-HTTPS.
 */
export interface GitHttpAuth {
  headers: Record<string, string>;
}

export function gitBasicAuthHeader(accessToken: string): GitHttpAuth {
  const basic = Buffer.from(`x-access-token:${accessToken}`, "utf8").toString(
    "base64",
  );
  return { headers: { Authorization: `Basic ${basic}` } };
}

/** No auth — public repos only. */
export function noGitHttpAuth(): GitHttpAuth {
  return { headers: {} };
}
