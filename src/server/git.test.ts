import { afterEach, describe, expect, it } from "vitest";
import { gitProcessEnv } from "./git";

const previousPager = process.env.PAGER;
const previousGitPager = process.env.GIT_PAGER;

afterEach(() => {
  if (previousPager === undefined) delete process.env.PAGER;
  else process.env.PAGER = previousPager;
  if (previousGitPager === undefined) delete process.env.GIT_PAGER;
  else process.env.GIT_PAGER = previousGitPager;
});

describe("gitProcessEnv", () => {
  it("strips PAGER / GIT_PAGER so simple-git does not reject the env", () => {
    process.env.PAGER = "less";
    process.env.GIT_PAGER = "delta";
    const env = gitProcessEnv();
    expect(env.PAGER).toBeUndefined();
    expect(env.GIT_PAGER).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});
