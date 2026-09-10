import fs from "node:fs";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { FileEdit } from "./patch-types";

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
    const count = original.split(edit.oldText).length - 1;
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
    fs.writeFileSync(
      absolute,
      original.replace(edit.oldText, edit.newText),
      "utf8",
    );
    if (!touched.includes(edit.path)) touched.push(edit.path);
  }
  return touched;
}
