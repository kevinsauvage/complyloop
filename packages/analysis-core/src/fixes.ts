import type { ProposedFix } from "./contract/finding-types.js";

export function applyFix(text: string, fix: ProposedFix): string {
  switch (fix.kind) {
    case "insert_attribute": {
      const elementText = text.slice(fix.span.start, fix.span.end);
      const selfClosing = elementText.endsWith("/>");
      const insertAt = fix.span.end - (selfClosing ? 2 : 1);
      const before = text.slice(0, insertAt).replace(/[ \t]*$/, "");
      const rest = text.slice(insertAt);
      const trailing = selfClosing ? " " : "";
      return `${before} ${fix.attribute}="${fix.value}"${trailing}${rest}`;
    }
    case "replace_attribute_value":
      return (
        text.slice(0, fix.span.start) +
        fix.replacementText +
        text.slice(fix.span.end)
      );
    case "remove_attribute":
      return text.slice(0, fix.span.start) + text.slice(fix.span.end);
    default: {
      const _exhaustive: never = fix;
      throw new Error(`Unhandled fix kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Returns the offending line as it would look after applying the fix. */
export function previewFixedLine(text: string, fix: ProposedFix, line: number): string {
  const fixedText = applyFix(text, fix);
  return (fixedText.split("\n")[line - 1] ?? "").trim();
}

export function describeFix(fix: ProposedFix): string {
  switch (fix.kind) {
    case "insert_attribute":
      return `Add ${fix.attribute}="${fix.value}" to the element`;
    case "replace_attribute_value":
      return `Replace the ${fix.attribute} value with ${fix.replacementText}`;
    case "remove_attribute":
      return `Remove the ${fix.attribute} attribute`;
    default: {
      const _exhaustive: never = fix;
      throw new Error(`Unhandled fix kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
