import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";

import type { CheckId } from "./check-registry.ts";
import { classNameTextOf } from "./checks/heuristic-utils.ts";
import type { ProposedFix } from "./contract/finding-types.ts";
import type { Severity } from "./contract/statuses.ts";
import { checkIdForJsxA11yRule, jsxA11yEslintRules } from "./jsx-a11y-map.ts";
import type { ParsedSource } from "./parse.ts";
import {
  attributeRemovalSpan,
  getAttribute,
  isPropSpreadingHost,
  type JsxTagNode,
  offsetAt,
  snippetForSpan,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "./parse.ts";
import type { RawFinding } from "./types.ts";

// Static import (not createRequire): bundlers and Vercel file tracing only
// follow static imports, so a dynamic require silently drops the plugin
// from serverless bundles (MODULE_NOT_FOUND in production). Interop is
// identical: the plugin is plain CJS, so the default import is module.exports.
const jsxA11y = jsxA11yPlugin as NonNullable<Linter.Config["plugins"]>[string];

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
    default:
      return null;
  }
}

const POINTER_ON_STATIC_RULES = new Set([
  "no-noninteractive-element-interactions",
  "click-events-have-key-events",
  "no-static-element-interactions",
]);

/**
 * Patterns jsx-a11y flags by element type that are the recommended
 * implementation, not a defect:
 * - a native `<dialog>` with an `onClick` backdrop-dismiss: Escape and focus
 *   handling are built in, the click is only a pointer convenience;
 * - `tabIndex={0}` on a named scrollable region (`overflow-x-auto` +
 *   `role="region"` + a label): keyboard users need it to scroll the content
 *   (axe `scrollable-region-focusable`).
 */
function isRecommendedPattern(ruleId: string, node: JsxTagNode): boolean {
  const bare = ruleId.replace(/^jsx-a11y\//, "");
  // `<Link {...props} />`: a wrapper forwarding its props, children included.
  if (bare === "anchor-has-content") return isPropSpreadingHost(node);
  if (POINTER_ON_STATIC_RULES.has(bare)) return tagNameOf(node) === "dialog";
  if (bare !== "no-noninteractive-tabindex") return false;
  const role = getAttribute(node, "role");
  const roleValue = role ? stringValueOf(role) : undefined;
  if (roleValue !== "region" && roleValue !== "group") return false;
  const named =
    getAttribute(node, "aria-label") !== undefined ||
    getAttribute(node, "aria-labelledby") !== undefined;
  return (
    named &&
    /\boverflow(?:-[xy])?-(?:auto|scroll)\b/.test(classNameTextOf(node))
  );
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

    const tag = innermostTagAt(parsed, start);
    if (tag && isRecommendedPattern(message.ruleId, tag)) continue;

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
