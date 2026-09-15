import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getToken = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => getToken(...args),
}));

import { proxy } from "./proxy";

function request(pathname: string, authorization?: string): NextRequest {
  const headers = authorization ? { authorization } : undefined;
  return new NextRequest(`https://app.example${pathname}`, { headers });
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function baseEnv() {
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("AUTH_GITHUB_ID", "id");
  vi.stubEnv("AUTH_GITHUB_SECRET", "secret");
  vi.stubEnv("AUTH_URL", "https://app.example");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BASIC_AUTH_USERNAME", "preview");
  vi.stubEnv("BASIC_AUTH_PASSWORD", "s3cret");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("proxy basic auth gate", () => {
  it("returns 401 with a Basic challenge when credentials are missing", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    const response = await proxy(request("/dashboard"));
    expect(response?.status).toBe(401);
    expect(response?.headers.get("www-authenticate")).toContain(
      'Basic realm="ComplyLoop"',
    );
  });

  it("rejects wrong credentials", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    const response = await proxy(
      request("/dashboard", basicAuthHeader("preview", "wrong")),
    );
    expect(response?.status).toBe(401);
  });

  it("rejects a malformed authorization header", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    const response = await proxy(request("/dashboard", "Bearer token"));
    expect(response?.status).toBe(401);
  });

  it("lets valid credentials through to the session logic", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    const response = await proxy(
      request("/dashboard", basicAuthHeader("preview", "s3cret")),
    );
    // Anonymous + basic OK → the existing logged-out redirect to /login.
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("leaves API routes untouched (own auth, no browser credential cache)", async () => {
    baseEnv();
    await expect(proxy(request("/api/health"))).resolves.toBeUndefined();
    await expect(
      proxy(request("/api/github/webhook")),
    ).resolves.toBeUndefined();
    await expect(
      proxy(request("/api/internal/jobs/run")),
    ).resolves.toBeUndefined();
  });

  it("leaves the gate open when credentials are unset (local dev)", async () => {
    baseEnv();
    vi.stubEnv("BASIC_AUTH_USERNAME", "");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "");
    getToken.mockResolvedValue({ sub: "123" });
    await expect(proxy(request("/dashboard"))).resolves.toBeUndefined();
  });
});
