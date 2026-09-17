import path from "node:path";

import fg from "fast-glob";

const IGNORED_DIRECTORIES = ["node_modules", ".next", ".git", "dist", "out"];

export type SourceExtensionSet = "jsx" | "script";

const GLOBS: Record<SourceExtensionSet, string[]> = {
  /** Assessed UI sources (AST checks). */
  jsx: ["**/*.{tsx,jsx}"],
  /** Broader tree for snapshots / connectability. */
  script: ["**/*.{tsx,jsx,ts,js}"],
};

/** Extensions hashed into assessment snapshots (mirrors the `script` glob). */
const SNAPSHOT_EXTENSIONS = new Set(["tsx", "jsx", "ts", "js"]);

/**
 * Whether a checkout-relative path belongs in the assessment snapshot —
 * exactly the set `listSourceFiles(root, "script")` enumerates (script
 * extensions, shared ignore directories as *directories*, no dotfiles).
 * The snapshot walk uses this per-entry so quota counting and hashing share
 * one tree walk without changing snapshot bytes.
 */
export function shouldSnapshotFile(relativePath: string): boolean {
  const segments = relativePath.split(path.sep);
  const basename = segments[segments.length - 1] ?? "";
  // fast-glob `dot: false`: no dot-segment at any level.
  if (segments.some((segment) => segment.startsWith("."))) return false;
  // Shared `**/<dir>/**` ignores apply to directories, not to a root-level
  // file that merely shares the name (e.g. `dist.ts` still snapshots).
  if (
    segments
      .slice(0, -1)
      .some((segment) => IGNORED_DIRECTORIES.includes(segment))
  ) {
    return false;
  }
  const dot = basename.lastIndexOf(".");
  if (dot < 0) return false;
  // Case-sensitive like fast-glob on Linux: `App.TSX` does not snapshot.
  return SNAPSHOT_EXTENSIONS.has(basename.slice(dot + 1));
}

function globRelative(
  rootPath: string,
  extensions: SourceExtensionSet,
): string[] {
  return fg.sync(GLOBS[extensions], {
    cwd: rootPath,
    onlyFiles: true,
    absolute: false,
    dot: false,
    ignore: IGNORED_DIRECTORIES.map((dir) => `**/${dir}/**`),
    followSymbolicLinks: false,
  });
}

/**
 * Absolute paths to source files under `rootPath`, sorted.
 * Uses fast-glob ignore semantics shared by scan, monitor, and connect.
 */
export function listSourceFiles(
  rootPath: string,
  extensions: SourceExtensionSet = "jsx",
): string[] {
  return globRelative(rootPath, extensions)
    .map((file) => path.join(rootPath, file))
    .sort((a, b) => a.localeCompare(b));
}

/** True when at least one matching source file exists (stops early). */
export function hasSourceFiles(
  rootPath: string,
  extensions: SourceExtensionSet = "script",
): boolean {
  return globRelative(rootPath, extensions).length > 0;
}
