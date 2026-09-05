import { generateObject } from "ai";
import { z } from "zod";
import type { Control } from "@/core/project-types";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { AI_MODEL } from "./model";
import type { ProposedFixEdits } from "./verified-fix";

const editsSchema = z.object({
  description: z.string(),
  edits: z.array(
    z.object({
      path: z.string(),
      oldText: z.string(),
      newText: z.string(),
    }),
  ).min(1),
});

const MAX_FILE_CHARS = 80_000;

interface ProposeFixEditsInput {
  finding: Finding;
  control: Control;
  fileContents: Record<string, string>;
}

function clip(text: string): string {
  if (text.length <= MAX_FILE_CHARS) return text;
  return `${text.slice(0, MAX_FILE_CHARS)}\n/* …truncated… */`;
}

/**
 * Asks the gateway model for unique search/replace edits. Typed output only —
 * callers apply and verify; this never sets a requirement status.
 */
export async function proposeFixEdits(
  input: ProposeFixEditsInput,
): Promise<ProposedFixEdits> {
  if (input.finding.location.kind !== "source") {
    throw new PublicError("AI patch generation requires a source Finding.");
  }
  const targetPath = input.finding.location.filePath;
  const files = Object.entries(input.fileContents)
    .map(([path, content]) => `--- ${path}\n${clip(content)}`)
    .join("\n\n");
  const { object } = await generateObject({
    model: AI_MODEL,
    schema: editsSchema,
    prompt: [
      "You fix accessibility failures in a React/TypeScript repository.",
      "Return unique search/replace edits. oldText must match exactly once in that file.",
      `Change only the Finding source file (${targetPath}) and only what is needed to fix this Finding.`,
      "Prefer the call site, not a shared primitive.",
      `Requirement: ${input.control.code} / ${input.control.secondaryCode} — ${input.control.title}.`,
      `Finding: ${input.finding.reason}`,
      `Location: ${formatLocationRef(input.finding.location)}`,
      "Current files:",
      files,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (object.edits.length === 0) {
    throw new PublicError("AI patch must contain at least one edit.");
  }
  if (object.edits.some((edit) => edit.path !== targetPath)) {
    throw new PublicError(`AI patch edits must target ${targetPath}.`);
  }
  return {
    description: object.description,
    provenance: "ai",
    model: AI_MODEL,
    edits: object.edits,
  };
}
