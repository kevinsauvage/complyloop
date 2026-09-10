import { createRequire } from "node:module";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import type { RawFinding } from "./types.ts";
import type { Severity } from "./contract/statuses.ts";
import type { ParsedSource } from "./parse.ts";
import { proposedFixForJsxA11y } from "./jsx-a11y-fixes.ts";
import { checkIdForJsxA11yRule, jsxA11yEslintRules } from "./jsx-a11y-map.ts";
import { offsetAt } from "./parse.ts";

const require = createRequire(import.meta.url);
const jsxA11y = require("eslint-plugin-jsx-a11y") as NonNullable<
  Linter.Config["plugins"]
>[string];

const linter = new Linter({ configType: "flat" });

const FLAT_CONFIG: Linter.Config = {
  files: ["**/*.{js,jsx,ts,tsx}"],
  plugins: { "jsx-a11y": jsxA11y },
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  settings: {
    "jsx-a11y": {
      components: {
        Link: "a",
        Image: "img",
      },
    },
  },
  rules: jsxA11yEslintRules(),
};

function severityFromEslint(severity: Linter.Severity): Severity {
  return severity === 2 ? "serious" : "moderate";
}

/**
 * Runs eslint-plugin-jsx-a11y on one JSX/TSX file and emits catalog findings.
 * Parse failures are skipped so the TypeScript AST pass can still report.
 */
export function lintJsxA11y(parsed: ParsedSource): RawFinding[] {
  const { filePath, text } = parsed;
  const messages = linter.verify(text, FLAT_CONFIG, { filename: filePath });

  const findings: RawFinding[] = [];
  for (const message of messages) {
    if (!message.ruleId) continue;
    const checkId = checkIdForJsxA11yRule(message.ruleId);
    if (!checkId) continue;

    const line = message.line;
    const column = message.column;
    const start = offsetAt(text, line, column);
    const end = message.endLine
      ? offsetAt(text, message.endLine, message.endColumn ?? 1)
      : start + 1;
    const snippet = (text.split("\n")[line - 1] ?? "").trim();

    findings.push({
      checkId,
      kind: "violation",
      severity: severityFromEslint(message.severity),
      confidence: "high",
      reason: message.message,
      location: {
        kind: "source",
        filePath,
        line,
        column,
        snippet,
        span: { start, end: Math.max(end, start + 1) },
      },
      fix: proposedFixForJsxA11y(parsed, checkId, start),
      analyzerId: "jsx-a11y",
      analyzerRuleId: message.ruleId,
    });
  }
  return findings;
}
