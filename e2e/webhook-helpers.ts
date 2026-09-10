import { createHmac } from "node:crypto";
import http, { type Server } from "node:http";

import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

import { E2E_PROJECT_FULL_NAME } from "./constants";
import { resolveE2EDbUrl } from "./helpers";

/** Must match `GITHUB_WEBHOOK_SECRET` injected into the e2e webServer env. */
export function resolveWebhookSecret(): string {
  return process.env.GITHUB_WEBHOOK_SECRET?.trim() || "e2e-webhook-secret";
}

export async function withDb<T>(
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(resolveE2EDbUrl(), { max: 3 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function signWebhookPayload(rawBody: string): string {
  return `sha256=${createHmac("sha256", resolveWebhookSecret())
    .update(rawBody)
    .digest("hex")}`;
}

export interface DeliverWebhookOptions {
  request: APIRequestContext;
  eventName: "push" | "pull_request";
  payload: Record<string, unknown>;
  deliveryId: string;
}

/** Signs and delivers a GitHub webhook; returns the endpoint response. */
export async function deliverWebhook({
  request,
  eventName,
  payload,
  deliveryId,
}: DeliverWebhookOptions) {
  const rawBody = JSON.stringify(payload);
  return request.post("/api/github/webhook", {
    headers: {
      "content-type": "application/json",
      "x-github-event": eventName,
      "x-github-delivery": deliveryId,
      "x-hub-signature-256": signWebhookPayload(rawBody),
    },
    data: rawBody,
  });
}

export function pushPayload(opts: { after?: string; fullName?: string } = {}) {
  return {
    ref: "refs/heads/main",
    after: opts.after ?? "a".repeat(40),
    before: "b".repeat(40),
    repository: {
      full_name: opts.fullName ?? E2E_PROJECT_FULL_NAME,
      name: "sample-app",
    },
  };
}

export function pullRequestPayload(opts: {
  action?: "opened" | "synchronize" | "reopened";
  headSha?: string;
  fullName?: string;
} = {}) {
  return {
    action: opts.action ?? "opened",
    number: 123,
    pull_request: {
      head: { sha: opts.headSha ?? "c".repeat(40) },
      base: { sha: "d".repeat(40) },
      title: "E2E fixture PR",
    },
    repository: {
      full_name: opts.fullName ?? E2E_PROJECT_FULL_NAME,
      name: "sample-app",
    },
  };
}

export async function waitForJobSuccess(options: {
  jobId: string;
  timeoutMs?: number;
}): Promise<void> {
  const { jobId } = options;
  const timeoutMs = options.timeoutMs ?? 120_000;
  await withDb(async (sql) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await sql<
        Array<{ status: string; error: string | null }>
      >`SELECT status, error FROM assessment_jobs WHERE id = ${jobId}`;
      if (rows.length === 0) {
        throw new Error(`Assessment job ${jobId} not found.`);
      }
      const { status, error } = rows[0];
      if (status === "succeeded") return;
      if (status === "failed" || status === "cancelled") {
        throw new Error(
          `Assessment job ${jobId} ended with status "${status}": ${error ?? "no error"}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for job ${jobId}.`);
  });
}

export interface MockGitHubCheckRun {
  owner: string;
  repo: string;
  body: {
    name?: string;
    conclusion?: string;
    output?: { title?: string; summary?: string };
    head_sha?: string;
  };
}

/**
 * Fixture GitHub Checks API. The e2e app points Octokit at
 * `GITHUB_API_BASE_URL` (see playwright.config.ts), so a PR webhook's Check
 * Run posting lands here and can be asserted on — no real GitHub required.
 */
export class MockGitHub {
  private server: Server | null = null;
  readonly checkRuns: MockGitHubCheckRun[] = [];

  async start(port: number, host = "127.0.0.1"): Promise<void> {
    this.checkRuns.length = 0;
    this.server = http.createServer((req, res) => {
      const url = req.url ?? "";
      const match = url.match(/^\/repos\/([^/]+)\/([^/]+)\/check-runs$/);
      if (req.method === "POST" && match) {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          this.checkRuns.push({
            owner: decodeURIComponent(match[1]),
            repo: decodeURIComponent(match[2]),
            body: JSON.parse(body || "{}"),
          });
          res.writeHead(201, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              id: 101,
              html_url: `https://github.com/${match[1]}/${match[2]}/actions/runs/1`,
              name: "ComplyLoop",
              status: "completed",
            }),
          );
        });
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(port, host, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}