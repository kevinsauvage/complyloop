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
  // Override default ignores of eslint-config-next.
  // `fixtures/` and `.data/` contain sample code with deliberate accessibility
  // violations for the platform to detect — they must not be linted.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "fixtures/**",
    ".data/**",
  ]),
]);

export default eslintConfig;
