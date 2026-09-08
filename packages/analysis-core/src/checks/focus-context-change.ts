import { makeContextChangeCheck } from "./make-context-change-check.ts";

export const focusContextChangeCheck = makeContextChangeCheck({
  id: "focus-context-change",
  handlers: ["onFocus", "onfocus"],
  reasonForTag: (tag) =>
    `<${tag}> onFocus handler appears to change context (navigate or submit). WCAG 3.2.1 requires focus not to trigger unexpected context changes.`,
});
