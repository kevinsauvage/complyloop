import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import simpleImportSort from "eslint-plugin-simple-import-sort";

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
  // Import organisation (docs/ai/architecture.md, "Module boundaries"):
  // side-effect ("server-only", css) → node builtins → external packages →
  // workspace (@complyloop/*) → app alias (@/*) → relative. Run
  // `npx eslint --fix` to sort; the sorter only reorders, it never merges.
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^\\u0000"],
            ["^node:"],
            ["^(?!@complyloop/|@/|\\.)"],
            ["^@complyloop/"],
            ["^@/"],
            ["^\\."],
          ],
        },
      ],
    },
  },
  // Architecture boundary (docs/ai/architecture.md, "Module boundaries"):
  // src/core/ is the framework-agnostic shared app kernel: no Next, no
  // Drizzle, no GitHub, no analysis engines. The shared contract
  // (@complyloop/analysis-core/contract/*) is the exception. Integration is
  // direct — pages/actions call src/server, which calls packages/db and
  // analysis-core. There is no app-level adapters/registry layer ("adapters"
  // under analysis-core is catalog packaging: RGAA/WCAG data, not ports).
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
              regex: "^@complyloop/analysis-core(?!/contract(?:/|$))(?:$|/)",
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
  // Assessment/worker pipeline must not pull finding-page UX policy:
  // `src/server/assessment*` may use remediation transitions and assessment
  // helpers, but never the `finding-act` beat model (docs/ai/architecture.md).
  {
    files: ["src/server/assessment*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/finding-act", "**/finding-act/**"],
              message:
                "assessment pipeline must not import the finding-page UX model (finding-act) — use remediation-lifecycle / assessment-helpers — see docs/ai/architecture.md.",
            },
          ],
        },
      ],
    },
  },
  // AI is an optional generation edge: `src/ai` takes contract types in and
  // returns results / throws PublicError out. It must never reach sideways
  // into `@/server` (observability included) — server callers inject an
  // `onError` hook instead (docs/ai/architecture.md).
  {
    files: ["src/ai/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/server", "**/server/**"],
              message:
                "src/ai must not import server (observability included) — accept an onError hook from the server caller instead — see docs/ai/architecture.md.",
            },
          ],
        },
      ],
    },
  },
  // Persistence, the compliance catalog, and the CI CLI are framework-agnostic
  // leaves: they must not import app/server/adapters-at-app layers. They may
  // import the analysis contract and each other. The catalog and db depend on
  // analysis-core contract; check depends on analysis-core (bundled at publish).
  {
    files: [
      "packages/db/**/*.{ts,tsx}",
      "packages/analysis-core/src/adapters/**/*.{ts,tsx}",
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
                "packages/db, the analysis-core catalog, and check must not import app/server/adapters/AI layers — see docs/ai/architecture.md (module boundaries).",
            },
            {
              regex: "^(../)*src/",
              message:
                "packages/db, the analysis-core catalog, and check must not reach outside their package (no ../src) — see docs/ai/architecture.md (module boundaries).",
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
    "e2e/fixtures/**",
    ".data/**",
  ]),
]);

export default eslintConfig;
