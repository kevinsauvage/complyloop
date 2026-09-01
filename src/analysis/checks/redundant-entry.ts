import ts from "typescript";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const IDENTITY_AUTOCOMPLETE = new Set([
  "email",
  "username",
  "name",
  "given-name",
  "family-name",
  "tel",
  "street-address",
  "postal-code",
  "country",
]);

const IDENTITY_TYPES = new Set(["email", "tel", "text", "password"]);

interface FieldRef {
  key: string;
  node: Parameters<typeof locationOf>[1];
}

function fieldKey(node: Parameters<typeof getAttribute>[0]): string | null {
  const tag = tagNameOf(node);
  if (tag !== "input") return null;
  const typeAttr = getAttribute(node, "type");
  const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
  if (!IDENTITY_TYPES.has(type)) return null;

  const auto =
    getAttribute(node, "autoComplete") ?? getAttribute(node, "autocomplete");
  const token = auto ? stringValueOf(auto)?.toLowerCase() : undefined;
  if (token && IDENTITY_AUTOCOMPLETE.has(token)) return token;

  const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "id");
  const name = nameAttr ? stringValueOf(nameAttr)?.toLowerCase() : undefined;
  if (!name) return null;
  if (IDENTITY_AUTOCOMPLETE.has(name)) return name;
  if (/email|username|phone|address|postal|zip|country|name/.test(name)) {
    return name;
  }
  return null;
}

function hasHiddenCarryover(
  sourceFile: ts.SourceFile,
  key: string,
): boolean {
  let found = false;
  visitJsxTags(sourceFile, (node) => {
    if (found) return;
    if (tagNameOf(node) !== "input") return;
    const typeAttr = getAttribute(node, "type");
    const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
    if (type !== "hidden") return;
    const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "id");
    const name = nameAttr ? stringValueOf(nameAttr)?.toLowerCase() : undefined;
    if (name && (name === key || name.includes(key))) found = true;
  });
  return found;
}

export const redundantEntryCheck: AccessibilityCheck = {
  id: "redundant-entry",
  run(source) {
    const fields: FieldRef[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const key = fieldKey(node);
      if (!key) return;
      fields.push({ key, node });
    });

    const counts = new Map<string, FieldRef[]>();
    for (const field of fields) {
      const bucket = counts.get(field.key) ?? [];
      bucket.push(field);
      counts.set(field.key, bucket);
    }

    const findings: RawFinding[] = [];
    for (const [key, bucket] of counts) {
      if (bucket.length < 2) continue;
      if (hasHiddenCarryover(source.sourceFile, key)) continue;
      for (const field of bucket.slice(1)) {
        findings.push({
          checkId: "redundant-entry",
          kind: "warning",
          severity: "moderate",
          confidence: "low",
          reason: `Identity field "${key}" is collected more than once without a hidden carry-over or autocomplete reuse (WCAG 3.3.7).`,
          location: locationOf(source, field.node),
          fix: null,
        });
      }
    }
    return findings;
  },
};
