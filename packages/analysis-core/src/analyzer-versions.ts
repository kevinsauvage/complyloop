import { createRequire } from "node:module";
import path from "node:path";

// `import.meta.url` first (tsx, Next/Vercel traced tree, vitest), workspace
// root fallback (esbuild-bundled worker, where `import.meta` is void).
// Must stay in this order: on Vercel only the traced tree carries optional
// deps, while the bundle runs with the checkout root as CWD — same
// precedent as `resolveAxeMinJsPath` in runtime/scan.ts.
const require = createRequire(
  typeof import.meta.url === "string" && import.meta.url.length > 0
    ? import.meta.url
    : path.join(process.cwd(), "package.json"),
);

function versionFromPackageJson(pkgJsonPath: string): string | undefined {
  try {
    const version = require(pkgJsonPath).version as string;
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

export function htmlValidatePackageVersion(): string | undefined {
  return versionFromPackageJson("html-validate/package.json");
}

/** axe-core semver when the peer is installed. */
export function axeCorePackageVersion(): string | undefined {
  return versionFromPackageJson("axe-core/package.json");
}
