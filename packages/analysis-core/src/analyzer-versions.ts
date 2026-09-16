import { createRequire } from "node:module";
import path from "node:path";

// Workspace-root-anchored (not `import.meta.url`): the esbuild-bundled
// worker has no meaningful module URL, and every runtime (tsx, Next,
// bundled Node) launches with the workspace root as CWD — same precedent
// as `resolveAxeMinJsPath` in runtime/scan.ts.
const require = createRequire(path.join(process.cwd(), "package.json"));

function versionFromPackageJson(pkgJsonPath: string): string | undefined {
  try {
    const version = require(pkgJsonPath).version as string;
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

/** html-validate semver when the package is installed. */
export function htmlValidatePackageVersion(): string | undefined {
  return versionFromPackageJson("html-validate/package.json");
}

/** axe-core semver when the peer is installed. */
export function axeCorePackageVersion(): string | undefined {
  return versionFromPackageJson("axe-core/package.json");
}
