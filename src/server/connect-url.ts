export class ConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectError";
  }
}

export function isLikelyGitUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/^https?:\/\/.+\.git$/i.test(trimmed)) return true;
  if (/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//i.test(trimmed)) {
    return true;
  }
  if (/^git@[^:]+:.+\.git$/i.test(trimmed)) return true;
  if (/^ssh:\/\/git@/i.test(trimmed)) return true;
  return false;
}
