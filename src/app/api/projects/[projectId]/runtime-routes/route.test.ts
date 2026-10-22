import { describe, expect, it, vi } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { RateLimitError } from "@/server/rate-limit";

import { POST } from "./route";

const requireProjectAccess = vi.hoisted(() => vi.fn());
const discoverRuntimeRoutes = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const assertRuntimeAuditRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/server/workspace/workspace", () => ({
  requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args),
}));

vi.mock("@/server/assessment/runtime-routes-discovery", () => ({
  discoverRuntimeRoutes: (...args: unknown[]) => discoverRuntimeRoutes(...args),
}));

vi.mock("@/server/auth-session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/server/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/rate-limit")>();
  return {
    ...actual,
    assertRuntimeAuditRateLimit: (...args: unknown[]) =>
      assertRuntimeAuditRateLimit(...args),
  };
});

function postRequest(
  projectId: string,
  body: unknown,
): [Request, { params: Promise<{ projectId: string }> }] {
  return [
    new Request(`http://localhost/api/projects/${projectId}/runtime-routes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId }) },
  ];
}

describe("POST /api/projects/[projectId]/runtime-routes", () => {
  it("returns 404 for an invalid project id", async () => {
    const [request, ctx] = postRequest("", { baseUrl: "https://x.test" });
    const response = await POST(request, ctx);
    expect(response.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it("returns 404 when the viewer cannot configure the project", async () => {
    requireProjectAccess.mockRejectedValue(new PublicError("Not allowed."));
    const [request, ctx] = postRequest("p1", { baseUrl: "https://x.test" });
    const response = await POST(request, ctx);
    expect(response.status).toBe(404);
    expect(discoverRuntimeRoutes).not.toHaveBeenCalled();
  });

  it("discovers routes for an authorized caller", async () => {
    requireProjectAccess.mockResolvedValue({ id: "p1" });
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    discoverRuntimeRoutes.mockResolvedValue({
      source: "robots",
      paths: ["/", "/pricing"],
      truncated: false,
    });
    const [request, ctx] = postRequest("p1", {
      baseUrl: "https://preview.example.com",
    });

    const response = await POST(request, ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source: "robots",
      paths: ["/", "/pricing"],
      truncated: false,
    });
    expect(requireProjectAccess).toHaveBeenCalledWith("p1", "project.connect");
    expect(discoverRuntimeRoutes).toHaveBeenCalledWith(
      "https://preview.example.com",
    );
    expect(assertRuntimeAuditRateLimit).toHaveBeenCalledWith("user-1");
  });

  it("rejects a missing base URL without any outbound request", async () => {
    requireProjectAccess.mockResolvedValue({ id: "p1" });
    const [request, ctx] = postRequest("p1", {});

    const response = await POST(request, ctx);

    expect(response.status).toBe(400);
    expect(discoverRuntimeRoutes).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body without any outbound request", async () => {
    requireProjectAccess.mockResolvedValue({ id: "p1" });
    const [request, ctx] = postRequest("p1", "{not json");

    const response = await POST(request, ctx);

    expect(response.status).toBe(400);
    expect(discoverRuntimeRoutes).not.toHaveBeenCalled();
  });

  it("maps a refused preview URL to 422 with its public message", async () => {
    requireProjectAccess.mockResolvedValue({ id: "p1" });
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    discoverRuntimeRoutes.mockRejectedValue(
      new PublicError(
        "Runtime audit URL cannot target localhost, private, or metadata hosts.",
      ),
    );
    const [request, ctx] = postRequest("p1", {
      baseUrl: "http://127.0.0.1:8080",
    });

    const response = await POST(request, ctx);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error:
        "Runtime audit URL cannot target localhost, private, or metadata hosts.",
    });
  });

  it("returns 429 when the audit rate limit is exhausted", async () => {
    requireProjectAccess.mockResolvedValue({ id: "p1" });
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    assertRuntimeAuditRateLimit.mockRejectedValueOnce(new RateLimitError());
    const [request, ctx] = postRequest("p1", { baseUrl: "https://x.test" });

    const response = await POST(request, ctx);

    expect(response.status).toBe(429);
    expect(discoverRuntimeRoutes).not.toHaveBeenCalled();
  });
});
