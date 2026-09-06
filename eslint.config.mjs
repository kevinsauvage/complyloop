import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // This product assesses other codebases for accessibility compliance —
  // hold our own UI to the strict jsx-a11y bar. The plugin itself is already
  // registered by eslint-config-next, so only the rules are layered on here.
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Architecture boundary (docs/ai/architecture.md, "Module boundaries"):
  // src/core/ is framework-agnostic and must not import from adapters,
  // analysis engines, server, or app. The shared contract
  // (@complyloop/analysis-core/contract/*) is the exception. server/app
  // integrate core via src/adapters/registry.ts. Core helpers that need
  // catalog data define a port (e.g. PresetCatalog) that callers pass in.
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapters", "**/adapters/**"],
              message:
                "src/core must not import adapters — see docs/ai/architecture.md (module boundaries).",
            },
            {
              group: ["**/analysis", "**/analysis/**"],
              message:
                "src/core must not import analysis — see docs/ai/architecture.md (module boundaries).",
            },
            {
              regex:
                "^@complyloop/analysis-core(?!/contract(?:/|$))(?:$|/)",
              message:
                "src/core may import only @complyloop/analysis-core/contract/* — see docs/ai/architecture.md (module boundaries).",
            },
            {
              group: ["**/server", "**/server/**"],
              message:
                "src/core must not import server — see docs/ai/architecture.md (module boundaries).",
            },
            {
              group: ["**/app", "**/app/**"],
              message:
                "src/core must not import app — see docs/ai/architecture.md (module boundaries).",
            },
          ],
        },
      ],
    },
  },
  // Persistence, adapters, and the CI CLI are framework-agnostic leaves:
  // they must not import app/server/adapters-at-app layers. They may import the
  // analysis contract and each other. adapters and db depend on analysis-core contract;
  // check depends on analysis-core (bundled at publish).
  {
    files: [
      "packages/db/**/*.{ts,tsx}",
      "packages/adapters/**/*.{ts,tsx}",
      "packages/check/**/*.{ts,tsx}",
    ],
    rules: {
      // packages import analysis-core's contract only (same rule as src/core).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/server",
                "**/server/**",
                "**/adapters",
                "**/adapters/**",
                "**/components",
                "**/components/**",
                "**/app",
                "**/app/**",
                "**/ai",
                "**/ai/**",
              ],
              message:
                "packages/db, adapters, check must not import app/server/adapters/AI layers — see docs/ai/architecture.md (module boundaries).",
            },
            {
              regex: "^(../)*src/",
              message:
                "packages/db, adapters, check must not reach outside their package (no ../src) — see docs/ai/architecture.md (module boundaries).",
            },
            {
              group: ["@/*"],
              message:
                "workspace packages must not use the app @ alias — see docs/ai/architecture.md (module boundaries).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  // `.data/` is legacy local junk (gitignored); `packages/check/testdata` and
  // `e2e/fixtures` have deliberate accessibility violations — do not lint.
  // `packages/check/dist` is the generated CLI bundle (gitignored).
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "packages/check/testdata/**",
    "packages/check/dist/**",
    "packages/analysis-core/dist/**",
    "packages/db/dist/**",
    "packages/adapters/dist/**",
    "e2e/fixtures/**",
    ".data/**",
  ]),
]);

export default eslintConfig;
