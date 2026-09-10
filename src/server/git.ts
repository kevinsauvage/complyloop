import "server-only";

import simpleGit, {
  type SimpleGit,
  type SimpleGitOptions,
} from "simple-git";

/**
 * Env keys simple-git ≥3.36 treats as unsafe when inherited from the process
 * (command-injection surface via pager/editor/ssh wrappers). Our git usage is
 * non-interactive plumbing (clone/fetch/commit), so strip them instead of
 * opting into `unsafe.allowUnsafePager`.
 */
const BLOCKED_GIT_ENV = [
  "PAGER",
  "GIT_PAGER",
  "EDITOR",
  "VISUAL",
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "GIT_EXTERNAL_DIFF",
  "GIT_PROXY_COMMAND",
] as const;

/** Process env safe to pass into simple-git for scripted operations. */
export function gitProcessEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  for (const key of BLOCKED_GIT_ENV) {
    delete env[key];
  }
  // Never prompt for credentials in server/webhook paths.
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

/** simple-git instance with a sanitized environment for non-interactive use. */
export function createGit(
  options: Partial<SimpleGitOptions> = {},
): SimpleGit {
  return simpleGit(options).env(gitProcessEnv());
}

/**
 * Auth for git-over-HTTPS without embedding the token in the clone/push URL
 * (URLs become process argv, visible via `ps`). Git ≥2.31 reads
 * `GIT_CONFIG_COUNT/KEY_x/VALUE_x` into its config, so the credential travels
 * in the child process environment instead. Env of a short-lived child is
 * meaningfully safer than argv (same-user visibility vs world-readable cmdline).
 *
 * GitHub's git endpoints expect the token as the password of an HTTP Basic
 * credential (`x-access-token:<token>`); `Authorization: Bearer` is accepted by
 * the REST API but rejected by git-over-HTTPS, which then falls back to a
 * credential prompt.
 */
export function gitAuthEnv(accessToken: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${accessToken}`, "utf8").toString(
    "base64",
  );
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

/**
 * simple-git instance authenticated via {@link gitAuthEnv}. Scoped exception
 * to simple-git's env-config gate (`unsafe.allowUnsafeConfigEnvCount`): the
 * only value passed this way is a server-minted token under a hardcoded
 * `http.extraHeader` key — no remote input reaches git config (refs are
 * validated by `parseCheckoutRef`, URLs by `parseOwnerRepo`). argv transport
 * would be strictly worse, so the flag is enabled here and nowhere else.
 */
export function createAuthedGit(
  accessToken: string,
  options: Partial<SimpleGitOptions> = {},
): SimpleGit {
  return simpleGit({
    ...options,
    unsafe: { ...options.unsafe, allowUnsafeConfigEnvCount: true },
  }).env(gitProcessEnv(gitAuthEnv(accessToken)));
}
