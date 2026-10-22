import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appPageRoute,
  buildRuntimeCoverage,
  pagesPageRoute,
  routeMatches,
} from "./runtime-coverage";

const tempDirs: string[] = [];

function makeTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-coverage-"));
  tempDirs.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("appPageRoute", () => {
  it("derives routes from app-router page files", () => {
    expect(appPageRoute("app/page.tsx")).toBe("/");
    expect(appPageRoute("src/app/about/page.tsx")).toBe("/about");
    expect(appPageRoute("app/(marketing)/about/page.tsx")).toBe("/about");
    expect(appPageRoute("app/blog/[slug]/page.tsx")).toBe("/blog/[slug]");
  });

  it("ignores non-page files and non-app trees", () => {
    expect(appPageRoute("app/layout.tsx")).toBeNull();
    expect(appPageRoute("app/about/route.ts")).toBeNull();
    expect(appPageRoute("components/Button.tsx")).toBeNull();
    expect(appPageRoute("pages/about.tsx")).toBeNull();
  });
});

describe("pagesPageRoute", () => {
  it("derives routes from pages-router files", () => {
    expect(pagesPageRoute("pages/index.tsx")).toBe("/");
    expect(pagesPageRoute("pages/about.tsx")).toBe("/about");
    expect(pagesPageRoute("pages/blog/index.tsx")).toBe("/blog");
    expect(pagesPageRoute("pages/blog/[slug].tsx")).toBe("/blog/[slug]");
  });

  it("ignores api, special files, and non-pages trees", () => {
    expect(pagesPageRoute("pages/api/hello.ts")).toBeNull();
    expect(pagesPageRoute("pages/_app.tsx")).toBeNull();
    expect(pagesPageRoute("app/page.tsx")).toBeNull();
  });
});

describe("routeMatches", () => {
  it("matches static, dynamic, and catch-all routes", () => {
    expect(routeMatches("/", "/")).toBe(true);
    expect(routeMatches("/about", "/about")).toBe(true);
    expect(routeMatches("/", "/about")).toBe(false);
    expect(routeMatches("/about", "/about/x")).toBe(false);
    expect(routeMatches("/blog/[slug]", "/blog/hello")).toBe(true);
    expect(routeMatches("/blog/[slug]", "/blog/a/b")).toBe(false);
    expect(routeMatches("/docs/[...slug]", "/docs/a/b")).toBe(true);
  });
});

describe("buildRuntimeCoverage", () => {
  it("is fully covered when every page file's route was audited", () => {
    const root = makeTree({ "app/page.tsx": "x", "app/about/page.tsx": "x" });
    const coverage = buildRuntimeCoverage(root, ["/", "/about"]);
    expect(coverage?.fullyCovered).toBe(true);
    expect([...(coverage?.coveredFiles ?? [])].sort()).toEqual([
      "app/about/page.tsx",
      "app/page.tsx",
    ]);
  });

  it("maps only the audited pages when coverage is partial", () => {
    const root = makeTree({
      "app/page.tsx": "x",
      "app/checkout/page.tsx": "x",
    });
    const coverage = buildRuntimeCoverage(root, ["/"]);
    expect(coverage?.fullyCovered).toBe(false);
    expect([...(coverage?.coveredFiles ?? [])]).toEqual(["app/page.tsx"]);
  });

  it("matches dynamic page files to concrete audited routes", () => {
    const root = makeTree({ "app/blog/[slug]/page.tsx": "x" });
    const coverage = buildRuntimeCoverage(root, ["/blog/hello"]);
    expect(coverage?.fullyCovered).toBe(true);
    expect([...(coverage?.coveredFiles ?? [])]).toEqual([
      "app/blog/[slug]/page.tsx",
    ]);
  });

  it("returns null when no page files are discoverable", () => {
    const root = makeTree({ "Bad.tsx": "x", "src/App.tsx": "x" });
    expect(buildRuntimeCoverage(root, ["/"])).toBeNull();
  });
});
