import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(packageDir)) {
    if (entry.endsWith(".tgz")) {
      fs.rmSync(path.join(packageDir, entry), { force: true });
    }
  }
}, 30_000);

function run(
  command: string,
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("@complyloop/check pack smoke", () => {
  it("builds a tarball that runs in a clean directory without the monorepo", () => {
    const build = run("npm", ["run", "build"], packageDir);
    expect(build.status, build.stderr).toBe(0);
    expect(fs.existsSync(path.join(packageDir, "dist/cli.js"))).toBe(true);

    const pack = run("npm", ["pack"], packageDir);
    expect(pack.status, pack.stderr).toBe(0);
    const tarballName = pack.stdout.trim().split("\n").at(-1);
    expect(tarballName).toMatch(/complyloop-check-.*\.tgz$/);
    const tarball = path.join(packageDir, tarballName!);

    const clean = fs.mkdtempSync(path.join(os.tmpdir(), "check-pack-"));
    tempDirs.push(clean);
    const app = path.join(clean, "app");
    fs.mkdirSync(app);
    fs.writeFileSync(
      path.join(app, "Bad.tsx"),
      `export const Bad = () => <img src="/x.png" />;\n`,
    );
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "smoke-app", private: true }, null, 2),
    );

    const install = run("npm", ["install", tarball], app);
    expect(install.status, install.stderr).toBe(0);

    const check = run("npx", ["complyloop-check", "."], app);
    expect(check.status).toBe(1);
    expect(check.stdout + check.stderr).toMatch(/img-alt/);
  }, 120_000);
});
