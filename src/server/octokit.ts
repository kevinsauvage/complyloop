import { Octokit } from "@octokit/rest";

/** Authenticated Octokit client for server-side GitHub REST calls. */
export function createOctokit(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
    userAgent: "ComplyLoop",
    // Test / GitHub Enterprise Server override; defaults to api.github.com.
    ...(process.env.GITHUB_API_BASE_URL
      ? { baseUrl: process.env.GITHUB_API_BASE_URL }
      : {}),
  });
}

export function octokitErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    const message =
      "message" in error && typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : fallback;
    return `${fallback} (${status}): ${message.slice(0, 300)}`;
  }
  if (error instanceof Error) return `${fallback}: ${error.message.slice(0, 300)}`;
  return fallback;
}
