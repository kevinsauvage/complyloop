import { afterEach, describe, expect, it } from "vitest";
import { gitAuthEnv, gitProcessEnv } from "./git";

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

  it("strips interactive wrappers and forces non-interactive mode", () => {
    const env = gitProcessEnv({
      GIT_SSH_COMMAND: "ssh -o evil",
      PAGER: "less",
    });
    expect(env.GIT_SSH_COMMAND).toBeUndefined();
    expect(env.PAGER).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});

describe("gitAuthEnv", () => {
  it("maps the token to an http.extraHeader Basic credential", () => {
    const env = gitAuthEnv("ghs_secret");
    const encoded = Buffer.from("x-access-token:ghs_secret").toString("base64");
    expect(env).toEqual({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraHeader",
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${encoded}`,
    });
  });

  it("carries no trace of URL-embedded credentials", () => {
    const serialized = JSON.stringify(gitAuthEnv("tok"));
    expect(serialized).not.toContain("x-access-token");
    expect(serialized).not.toContain("github.com");
  });
});
