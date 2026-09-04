import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function versionFromPackageJson(
  pkgJsonPath: string,
): string | undefined {
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

/** IBM accessibility-checker semver. */
export function ibmCheckerPackageVersion(): string | undefined {
  try {
    const entry = require.resolve("accessibility-checker");
    const pkgJsonPath = path.join(path.dirname(entry), "..", "package.json");
    const version = JSON.parse(readFileSync(pkgJsonPath, "utf8")).version as
      | string
      | undefined;
    return version && version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}
