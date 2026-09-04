/**
 * html-validate rendered pass.
 *
 * Validates the **generated DOM** of a page (`document.documentElement`
 * serialized) inside the existing runtime audit. This is the evidence RGAA
 * itself prescribes — validate the generated document — so it can *pass* a
 * requirement (validating JSX source could only fail, never verify).
 *
 * html-validate reports line/column in the serialized string, not a DOM node.
 * We serialize the DOM ourselves (see `serializeDocument`), record each
 * element's start offset, validate that exact string in Node, then map every
 * message back to the element under its offset to build a `dom` location
 * (selector + snippet) that looks like every other runtime finding.
 */
import { HtmlValidate } from "html-validate";
import type { Page } from "playwright";
import { htmlValidatePackageVersion } from "../analyzer-versions.ts";
import { checkIdForHtmlValidateRule } from "./html-validate-map.ts";
import type { RawFinding } from "../types.ts";

/**
 * Curated html-validate rules for RGAA 8.2 markup validity and 10.1 deprecated
 * presentational markup. Duplicate ids, landmarks, labels, ARIA, and broken
 * idrefs are axe / custom Playwright — not enabled here.
 */
const RENDERED_RULES = {
  "element-permitted-content": "error",
  "element-permitted-order": "error",
  "close-order": "error",
  "no-implicit-close": "error",
  "no-dup-attr": "error",
  "no-deprecated-attr": "error",
  deprecated: "error",
} as const;

export const HTML_VALIDATE_RENDERED_RULE_IDS = Object.keys(
  RENDERED_RULES,
) as Array<keyof typeof RENDERED_RULES>;

export const HTML_VALIDATE_INPUT_KIND = "live-dom-serialization" as const;

// Lazily built (module-level HtmlValidate is fine; it stays offline).
let validator: HtmlValidate | null = null;
function getValidator(): HtmlValidate {
  validator ??= new HtmlValidate({ root: true, rules: RENDERED_RULES });
  return validator;
}

/** HTML void elements — serializer emits them self-closed. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

interface SerializedElement {
  offset: number;
  /** Exclusive end of this element in the serialized string (includes closing tag). */
  closeEndOffset?: number;
  selector: string;
  html: string;
}

export interface SerializeDocumentResult {
  html: string;
  elements: SerializedElement[];
}

/**
 * Browser-side serializer. Walks the DOM under `document.documentElement`,
 * building an HTML string exactly as html-validate will parse it, and records
 * every element's start offset, a compact CSS selector, and its outerHTML
 * snippet. Because the string we validate is the string we build here, offset
 * mapping is exact by construction.
 *
 * Self-contained (no external closure; `voidTags` is passed as an argument) so
 * Playwright can serialize it into the page.
 */
export function serializeDocument(voidTags: string[]): SerializeDocumentResult {
  const VOID = new Set(voidTags);
  const out: SerializeDocumentResult = { html: "", elements: [] };

  function escText(v: unknown): string {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttrValue(v: unknown): string {
    return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function selectorOf(el: Element): string {
    if (el.id) {
      return `#${el.id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")}`;
    }
    const parts: string[] = [];
    let current: Element | null = el;
    let depth = 0;
    while (current && depth < 6) {
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      let seg = tag;
      if (parent) {
        let index = 1;
        for (const child of parent.children) {
          if (child.tagName === current.tagName) {
            if (child === current) break;
            index += 1;
          }
        }
        if (index > 1) seg += `:nth-of-type(${index})`;
      }
      parts.unshift(seg);
      current = parent;
      depth += 1;
    }
    return parts.join(" > ");
  }

  function build(node: Node): void {
    if (node.nodeType === 3) {
      out.html += escText(node.nodeValue);
      return;
    }
    if (node.nodeType === 8) return; // comment — skip
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const isVoid = VOID.has(tag);
    const offset = out.html.length;

    let open = `<${tag}`;
    for (const attr of Array.from(el.attributes)) {
      open += ` ${attr.name}="${escAttrValue(attr.value)}"`;
    }
    open += isVoid ? "/>" : ">";
    out.html += open;

    const snippet = (el.outerHTML || "").replace(/\s+/g, " ").trim();
    const elIndex = out.elements.length;
    out.elements.push({
      offset,
      selector: selectorOf(el),
      html: snippet.length > 200 ? `${snippet.slice(0, 197)}…` : snippet,
    });

    if (!isVoid) {
      for (const child of Array.from(el.childNodes)) build(child);
      out.html += `</${tag}>`;
      out.elements[elIndex]!.closeEndOffset = out.html.length;
    } else {
      out.elements[elIndex]!.closeEndOffset = out.html.length;
    }
  }

  build(document.documentElement);
  return out;
}

/** Captures the serialized document (with node→offset map) from a live page. */
export async function captureSerializedDom(
  page: Page,
): Promise<SerializeDocumentResult> {
  // `serializeDocument` is defined in Node scope; the page cannot reference it.
  // Pass its serialized source as an argument and rebuild it in the page via the
  // self-contained function (voidTags arrives as an argument).
  const runInPage = (arg: {
    source: string;
    voidTags: string[];
  }): SerializeDocumentResult => {
    const fn = new Function(
      `return (${arg.source});`,
    )() as (tags: string[]) => SerializeDocumentResult;
    return fn(arg.voidTags);
  };
  return page.evaluate(runInPage, {
    source: serializeDocument.toString(),
    voidTags: [...VOID_ELEMENTS],
  }) as unknown as Promise<SerializeDocumentResult>;
}

interface HtmlValidateMessage {
  ruleId?: string;
  severity?: number;
  line?: number;
  column?: number;
  message?: string;
}

/** Offset of a 1-based line/column in a string. */
function offsetForLineColumn(text: string, line: number, column: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < text.length) {
    const nl = text.indexOf("\n", offset);
    if (nl === -1) break;
    offset = nl + 1;
    currentLine += 1;
  }
  return Math.min(offset + Math.max(0, column - 1), text.length);
}

/** The element whose serialized span contains `offset` (deepest match). */
function elementAtOffset(
  elements: SerializedElement[],
  offset: number,
): SerializedElement | undefined {
  let match: SerializedElement | undefined;
  for (const el of elements) {
    const end = el.closeEndOffset ?? el.offset;
    if (offset >= el.offset && offset < end) {
      if (!match || el.offset >= match.offset) match = el;
    }
  }
  if (match) return match;

  for (const el of elements) {
    if (el.offset <= offset) match = el;
    else break;
  }
  return match;
}

function findingConfidence(checkId: string): RawFinding["confidence"] {
  return checkId === "markup-nesting" ? "medium" : "high";
}

function htmlValidateReason(
  msg: HtmlValidateMessage,
  version: string | undefined,
): string {
  const rule = msg.ruleId ?? "unknown";
  const detail = msg.message ?? "structural HTML issue";
  const versionLabel = version ?? "unknown";
  return (
    `Live DOM serialization (html-validate ${versionLabel}, not SSR/source HTML): ` +
    `[${rule}] ${detail}. Browser-repaired tree only; doctype omitted from validated string.`
  );
}

function findingSeverity(checkId: string): RawFinding["severity"] {
  return checkId === "css-for-presentation" ? "moderate" : "serious";
}

/**
 * Runs html-validate over a captured serialized document and converts every
 * mapped message into a runtime `dom` finding. Pure — used by the Playwright
 * runner and unit tests.
 */
export function htmlValidateFindingsFromSerialized(
  serialized: SerializeDocumentResult,
  url: string,
  options?: { doctypeIncludedInInput?: boolean },
): RawFinding[] {
  const report = getValidator().validateStringSync(serialized.html, url);
  const messages: HtmlValidateMessage[] =
    report.results[0]?.messages ?? [];
  const findings: RawFinding[] = [];
  const version = htmlValidatePackageVersion();
  const doctypeIncludedInInput = options?.doctypeIncludedInInput ?? false;

  for (const msg of messages) {
    if (msg.severity !== 2) continue;
    if (!msg.ruleId) continue;
    const checkId = checkIdForHtmlValidateRule(msg.ruleId);
    if (!checkId) continue;

    const line = msg.line ?? 1;
    const column = msg.column ?? 1;
    const offset = offsetForLineColumn(serialized.html, line, column);
    const el = elementAtOffset(serialized.elements, offset);

    findings.push({
      checkId,
      kind: "violation",
      severity: findingSeverity(checkId),
      confidence: findingConfidence(checkId),
      reason: htmlValidateReason(msg, version),
      location: {
        kind: "dom",
        url,
        selector: el?.selector ?? "(document)",
        snippet: el?.html ?? "(whole document)",
        elementLabel: el ? `element (${el.selector})` : undefined,
        context: msg.message,
      },
      fix: null,
      engine: "runtime",
      analyzerId: "html-validate",
      analyzerRuleId: msg.ruleId,
      analyzerVersion: version,
      validationInput: HTML_VALIDATE_INPUT_KIND,
      validationRules: [...HTML_VALIDATE_RENDERED_RULE_IDS],
      doctypeIncludedInInput,
    });
  }

  return findings;
}

/** Rendered pass (Pass B): validate a page's DOM and return runtime findings. */
export async function htmlValidateFindingsForPage(
  page: Page,
  url: string,
): Promise<RawFinding[]> {
  const serialized = await captureSerializedDom(page);
  return htmlValidateFindingsFromSerialized(serialized, url, {
    doctypeIncludedInInput: false,
  });
}