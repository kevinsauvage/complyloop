import { createRequire } from "node:module";

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
