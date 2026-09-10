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
