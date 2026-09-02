import { getAttribute, stringValueOf, tagNameOf } from "../parse.js";

export const AUTH_AUTOCOMPLETE = new Set([
  "username",
  "current-password",
  "new-password",
  "email",
  "one-time-code",
]);

export function isAuthField(node: Parameters<typeof getAttribute>[0]): boolean {
  const tag = tagNameOf(node);
  if (tag !== "input") return false;
  const typeAttr = getAttribute(node, "type");
  const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
  if (type === "password") return true;
  const auto =
    getAttribute(node, "autoComplete") ?? getAttribute(node, "autocomplete");
  const token = auto ? stringValueOf(auto)?.toLowerCase() : undefined;
  return Boolean(token && AUTH_AUTOCOMPLETE.has(token));
}
