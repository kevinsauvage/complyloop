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

  it("keeps the marketing pages outside the gate", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    for (const path of ["/", "/legal", "/legal/privacy"]) {
      const response = await proxy(request(path));
      expect(response?.status).toBe(200);
      expect(response?.headers.get("www-authenticate")).toBeNull();
    }
  });

  it("still gates the login page and the workspace", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    for (const path of ["/login", "/dashboard", "/findings"]) {
      const response = await proxy(request(path));
      expect(response?.status).toBe(401);
    }
  });

  it("leaves API routes untouched (own auth, no browser credential cache)", async () => {
    baseEnv();
    await expect(proxy(request("/api/health"))).resolves.toBeUndefined();
    await expect(
      proxy(request("/api/github/webhook")),
    ).resolves.toBeUndefined();
  });

  it("leaves the Sentry tunnel untouched (no gate, no login redirect)", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    await expect(proxy(request("/monitoring"))).resolves.toBeUndefined();
  });

  it("strips the cached Basic credential from the Sentry tunnel so ingest accepts the envelope", async () => {
    baseEnv();
    getToken.mockResolvedValue(null);
    // getsentry/sentry-javascript#8341: the rewrite forwards headers to
    // Sentry ingest, which reads `authorization` as DSN auth and 400s with
    // `invalid project key`. The tunnel must never be gated — just cleaned.
    const tunneled = await proxy(
      request("/monitoring", basicAuthHeader("preview", "s3cret")),
    );
    expect(tunneled?.status).toBe(200);
    expect(tunneled?.headers.get("authorization")).toBeNull();
  });

  it("leaves the gate open when credentials are unset (local dev)", async () => {
    baseEnv();
    vi.stubEnv("BASIC_AUTH_USERNAME", "");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "");
    getToken.mockResolvedValue({ sub: "123" });
    const response = await proxy(request("/dashboard"));
    expect(response?.status).toBe(200);
  });

  it("still gates with Basic auth when GitHub auth is unconfigured", async () => {
    baseEnv();
    // Basic auth set, AUTH_* unset: the gate must not fail open on the
    // GitHub-auth early return.
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_GITHUB_ID", "");
    vi.stubEnv("AUTH_GITHUB_SECRET", "");
    const response = await proxy(request("/dashboard"));
    expect(response?.status).toBe(401);
    expect(response?.headers.get("www-authenticate")).toContain(
      'Basic realm="ComplyLoop"',
    );
  });
});

describe("proxy content security policy", () => {
  it("attaches a nonce-based CSP to authorized page responses", async () => {
    baseEnv();
    getToken.mockResolvedValue({ sub: "123" });
    const response = await proxy(
      request("/dashboard", basicAuthHeader("preview", "s3cret")),
    );
    const csp = response?.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("https://avatars.githubusercontent.com");
    // A nonce makes `'unsafe-inline'` meaningless for scripts — it must be absent.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("relaxes script-src and connect-src in development", async () => {
    baseEnv();
    vi.stubEnv("NODE_ENV", "development");
    getToken.mockResolvedValue({ sub: "123" });
    const response = await proxy(
      request("/dashboard", basicAuthHeader("preview", "s3cret")),
    );
    const csp = response?.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });
});
