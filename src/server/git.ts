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
  envOverrides: Record<string, string> = {},
): SimpleGit {
  return simpleGit(options).env(gitProcessEnv(envOverrides));
}

/**
 * Auth for git-over-HTTPS without embedding the token in the clone/push URL
 * (URLs become process argv, visible via `ps`). Git ≥2.31 reads
 * `GIT_CONFIG_COUNT/KEY_x/VALUE_x` into its config, so the token travels as an
 * `Authorization` header in the child process environment instead. Env of a
 * short-lived child is meaningfully safer than argv (same-user visibility
 * vs world-readable cmdline).
 */
export function gitAuthEnv(accessToken: string): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Bearer ${accessToken}`,
  };
}
