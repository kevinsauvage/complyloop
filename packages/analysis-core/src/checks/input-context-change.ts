import { makeContextChangeCheck } from "./make-context-change-check.ts";

const INPUT_HANDLERS = [
  "onChange",
  "onInput",
  "onBlur",
  "onchange",
  "oninput",
  "onblur",
] as const;

export const inputContextChangeCheck = makeContextChangeCheck({
  id: "input-context-change",
  handlers: INPUT_HANDLERS,
  reasonForTag: (tag) =>
    `<${tag}> input handler appears to change context (navigate or submit) without warning. WCAG 3.2.2 requires input not to trigger unexpected context changes.`,
});
