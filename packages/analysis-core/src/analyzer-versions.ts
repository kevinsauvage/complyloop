import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function readPackageVersion(name: string): string | undefined {
  try {
    const version = require(`${name}/package.json`).version as string;
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

/** html-validate semver when the package is installed. */
export function htmlValidatePackageVersion(): string | undefined {
  return readPackageVersion("html-validate");
}

/** axe-core semver when the peer is installed. */
export function axeCorePackageVersion(): string | undefined {
  return readPackageVersion("axe-core");
}

/** IBM accessibility-checker semver. */
export function ibmCheckerPackageVersion(): string | undefined {
  return readPackageVersion("accessibility-checker");
}
