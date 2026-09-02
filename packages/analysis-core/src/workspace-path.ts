import path from "node:path";

/**
 * Resolves `relativePath` under `rootPath` and rejects traversal outside the
 * workspace (e.g. `../etc/passwd`).
 */
export function resolveInside(rootPath: string, relativePath: string): string {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(root, relativePath);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    return resolved;
  }
  throw new Error(
    `Path escapes project root: ${relativePath}`,
  );
}
