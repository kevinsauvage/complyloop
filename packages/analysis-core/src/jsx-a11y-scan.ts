import { createRequire } from "node:module";

import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";

import type { CheckId } from "./check-registry.ts";
import type { ProposedFix } from "./contract/finding-types.ts";
import type { Severity } from "./contract/statuses.ts";
import { checkIdForJsxA11yRule, jsxA11yEslintRules } from "./jsx-a11y-map.ts";
import type { ParsedSource } from "./parse.ts";
import {
  attributeRemovalSpan,
  getAttribute,
  type JsxTagNode,
  offsetAt,
  snippetForSpan,
  spanOf,
  tagNameOf,
  visitJsxTags,
} from "./parse.ts";
import type { RawFinding } from "./types.ts";

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

function innermostTagAt(
  parsed: ParsedSource,
  offset: number,
): JsxTagNode | undefined {
  let match: JsxTagNode | undefined;
  let matchSize = Number.POSITIVE_INFINITY;
  visitJsxTags(parsed.sourceFile, (node) => {
    const span = spanOf(node, parsed.sourceFile);
    if (offset < span.start || offset >= span.end) return;
    const size = span.end - span.start;
    if (size < matchSize) {
      match = node;
      matchSize = size;
    }
  });
  return match;
}

function insertAttribute(
  parsed: ParsedSource,
  node: JsxTagNode,
  attribute: string,
  value: string,
): ProposedFix {
  return {
    kind: "insert_attribute",
    attribute,
    value,
    editable: true,
    span: spanOf(node, parsed.sourceFile),
  };
}

function removeNamedAttribute(
  parsed: ParsedSource,
  node: JsxTagNode,
  names: readonly string[],
): ProposedFix | null {
  for (const name of names) {
    const attr = getAttribute(node, name);
    if (!attr) continue;
    return {
      kind: "remove_attribute",
      attribute: attr.name.getText(),
      span: attributeRemovalSpan(attr, parsed.sourceFile, parsed.text),
    };
  }
  return null;
}

/**
 * Structured fixes for jsx-a11y findings we can apply the same way as AST
 * checks (insert/remove attribute). Unmapped rules stay without a template.
 */
function proposedFixForJsxA11y(
  parsed: ParsedSource,
  checkId: CheckId,
  offset: number,
): ProposedFix | null {
  const node = innermostTagAt(parsed, offset);
  if (!node) return null;

  switch (checkId) {
    case "img-alt":
      if (getAttribute(node, "alt")) return null;
      if (tagNameOf(node) !== "img" && tagNameOf(node) !== "Image") return null;
      return insertAttribute(parsed, node, "alt", "Describe this image");
    case "iframe-title":
      if (getAttribute(node, "title")) return null;
      return insertAttribute(parsed, node, "title", "Describe this frame");
    case "html-lang":
      if (getAttribute(node, "lang")) return null;
      return insertAttribute(parsed, node, "lang", "en");
    case "no-autofocus":
      return removeNamedAttribute(parsed, node, ["autoFocus", "autofocus"]);
    case "no-accesskey":
      return removeNamedAttribute(parsed, node, ["accessKey", "accesskey"]);
    // Only a handful of jsx-a11y CheckIds have a structured template.
    default:
      return null;
  }
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
    const snippet = snippetForSpan(text, start, end);

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
