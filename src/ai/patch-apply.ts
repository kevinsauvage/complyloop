import fs from "node:fs";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";

import type { FileEdit } from "./patch-types";

/**
 * Applies one edit to in-memory text, enforcing the same uniqueness contract
 * as file application. Shared by checkout writes and API-side commits so a
 * patch cannot mean something different depending on where it lands.
 *
 * Sliced rather than `String.replace`, whose string pattern still expands
 * `$&`/`$$` in the replacement — committed text must equal the reviewed text.
 */
export function applyEditToText(text: string, edit: FileEdit): string {
  const count = text.split(edit.oldText).length - 1;
  if (count === 0) {
    throw new PublicError(
      `Edit oldText not found in ${edit.path}. Generate the patch again.`,
    );
  }
  if (count > 1) {
    throw new PublicError(
      `Edit oldText is not unique in ${edit.path} (${count} matches).`,
    );
  }
  const at = text.indexOf(edit.oldText);
  return (
    text.slice(0, at) + edit.newText + text.slice(at + edit.oldText.length)
  );
}

/** Replaces unique `oldText` occurrences. Restores nothing on failure — caller snapshots. */
export function applyFileEdits(
  rootPath: string,
  edits: ReadonlyArray<FileEdit>,
): string[] {
  const touched: string[] = [];
  for (const edit of edits) {
    const absolute = resolveInside(rootPath, edit.path);
    if (!fs.existsSync(absolute)) {
      throw new PublicError(`File not found in checkout: ${edit.path}`);
    }
    const original = fs.readFileSync(absolute, "utf8");
    fs.writeFileSync(absolute, applyEditToText(original, edit), "utf8");
    if (!touched.includes(edit.path)) touched.push(edit.path);
  }
  return touched;
}
