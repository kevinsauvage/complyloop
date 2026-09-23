import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = ["node_modules", ".next", ".git", "dist", "out"];

export type SourceExtensionSet = "jsx" | "script";

const EXTENSIONS: Record<SourceExtensionSet, ReadonlySet<string>> = {
  /** Assessed UI sources (AST checks). */
  jsx: new Set(["tsx", "jsx"]),
  /** Broader tree for snapshots / connectability. */
  script: new Set(["tsx", "jsx", "ts", "js"]),
};

/**
 * Whether a checkout-relative path belongs in the assessment snapshot —
 * exactly the set `listSourceFiles(root, "script")` enumerates (script
 * extensions, shared ignore directories as *directories*, no dotfiles).
 * The snapshot walk uses this per-entry so quota counting and hashing share
 * one tree walk without changing snapshot bytes.
 */
export function shouldSnapshotFile(relativePath: string): boolean {
  return matchesSourceSet(relativePath, "script");
}

function matchesSourceSet(
  relativePath: string,
  extensions: SourceExtensionSet,
): boolean {
  const segments = relativePath.split(path.sep);
  const basename = segments[segments.length - 1] ?? "";
  // No dot-segment at any level (the old `dot: false`).
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
  // Case-sensitive like the old glob: `App.TSX` does not snapshot.
  return EXTENSIONS[extensions].has(basename.slice(dot + 1));
}

function walkSourceFiles(
  rootPath: string,
  extensions: SourceExtensionSet,
): string[] {
  const results: string[] = [];
  const visit = (dir: string, relativeDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Missing/unreadable root (e.g. a checkout that never landed) lists
      // nothing, matching the old glob's empty result.
      return;
    }
    for (const entry of entries) {
      const relative = relativeDir
        ? path.join(relativeDir, entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        if (
          entry.name.startsWith(".") ||
          IGNORED_DIRECTORIES.includes(entry.name)
        ) {
          continue;
        }
        visit(path.join(dir, entry.name), relative);
      } else if (entry.isFile() && matchesSourceSet(relative, extensions)) {
        // `isFile()` is lstat-based, so symlinks are skipped — the old
        // `followSymbolicLinks: false`.
        results.push(relative);
      }
    }
  };
  visit(rootPath, "");
  return results;
}

/**
 * Absolute paths to source files under `rootPath`, sorted.
 * Shares one ignore/extension predicate with scan, monitor, and connect.
 */
export function listSourceFiles(
  rootPath: string,
  extensions: SourceExtensionSet = "jsx",
): string[] {
  return walkSourceFiles(rootPath, extensions)
    .map((file) => path.join(rootPath, file))
    .sort((a, b) => a.localeCompare(b));
}

/** True when at least one matching source file exists. */
export function hasSourceFiles(
  rootPath: string,
  extensions: SourceExtensionSet = "script",
): boolean {
  return walkSourceFiles(rootPath, extensions).length > 0;
}
