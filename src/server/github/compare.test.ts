import { beforeEach, describe, expect, it, vi } from "vitest";

const compareCommitsWithBasehead = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./github", () => ({
  createOctokit: () => ({ rest: { repos: { compareCommitsWithBasehead } } }),
  parseOwnerRepo: (fullName: string) => {
    const [owner, repo] = fullName.split("/");
    return { owner, repo };
  },
}));

const { compareCommitFiles } = await import("./compare");

const options = {
  fullName: "acme/web",
  accessToken: "token",
  base: "a",
  head: "b",
};

function respond(data: { status: string; files?: unknown[] }) {
  compareCommitsWithBasehead.mockResolvedValueOnce({ data });
}

describe("compareCommitFiles", () => {
  beforeEach(() => compareCommitsWithBasehead.mockReset());

  it("lists changed, removed and both sides of renamed paths", async () => {
    respond({
      status: "ahead",
      files: [
        { filename: "src/a.tsx", status: "modified" },
        { filename: "src/gone.tsx", status: "removed" },
        {
          filename: "src/new.tsx",
          previous_filename: "src/old.tsx",
          status: "renamed",
        },
      ],
    });
    await expect(compareCommitFiles(options)).resolves.toEqual([
      { filePath: "src/a.tsx", removed: false },
      { filePath: "src/gone.tsx", removed: true },
      { filePath: "src/old.tsx", removed: true },
      { filePath: "src/new.tsx", removed: false },
    ]);
    expect(compareCommitsWithBasehead).toHaveBeenCalledOnce();
  });

  it.each(["behind", "diverged"])(
    "refuses a %s range: the merge-base diff misses the old side",
    async (status) => {
      respond({ status, files: [] });
      await expect(compareCommitFiles(options)).resolves.toBeNull();
    },
  );

  it("refuses an unlisted or possibly truncated file list", async () => {
    respond({ status: "ahead" });
    await expect(compareCommitFiles(options)).resolves.toBeNull();

    respond({
      status: "ahead",
      files: Array.from({ length: 300 }, (_, i) => ({
        filename: `f${i}.tsx`,
        status: "modified",
      })),
    });
    await expect(compareCommitFiles(options)).resolves.toBeNull();
  });

  it("reads an API failure as not comparable", async () => {
    compareCommitsWithBasehead.mockRejectedValueOnce(new Error("503"));
    await expect(compareCommitFiles(options)).resolves.toBeNull();
  });
});
