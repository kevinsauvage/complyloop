import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { reportError, reportWarning } from "@/server/observability";

const getDrizzle = vi.hoisted(() => vi.fn());
const queuedAssessmentJobCount = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: () => getDrizzle(),
}));

vi.mock("@/server/assessment-jobs", () => ({
  queuedAssessmentJobCount: () => queuedAssessmentJobCount(),
}));

vi.mock("@/server/observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(reportError).mockReset();
  vi.mocked(reportWarning).mockReset();
  getDrizzle.mockReset();
  queuedAssessmentJobCount.mockReset();
});

describe("GET /api/health", () => {
  it("reports a warning, not an error, when the database is down", async () => {
    getDrizzle.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      database: "down",
    });
    expect(reportError).not.toHaveBeenCalled();
    expect(reportWarning).toHaveBeenCalledWith(
      "connect ECONNREFUSED",
      expect.objectContaining({ code: "health_database_down" }),
    );
  });
});
