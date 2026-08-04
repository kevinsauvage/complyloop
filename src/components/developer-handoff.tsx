import { CopyButton } from "@/components/copy-button";
import { CreatePrForm } from "@/components/create-pr-form";
import { Card, CodeBlock } from "@/components/ui";
import type { DeveloperHandoff } from "@/server/handoff";

export function DeveloperHandoffCard({
  handoff,
  findingId,
  canCreatePr,
}: {
  handoff: DeveloperHandoff;
  findingId: string;
  canCreatePr: boolean;
}) {
  const patchFile = `${handoff.title.replace(/[^\w.-]+/g, "-").toLowerCase()}.patch`;
  const prFile = `${handoff.title.replace(/[^\w.-]+/g, "-").toLowerCase()}-pr.md`;

  return (
    <Card title="Developer handoff (patch / PR)">
      <p className="mb-3 text-sm text-zinc-600">
        Copy a unified diff and a pull-request body into your normal git workflow,
        or create a branch/PR when the project root is a git repository.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-900">{handoff.title}</p>
        <CopyButton label="Copy title" text={handoff.title} />
      </div>

      {handoff.diff ? (
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap gap-2">
            <CopyButton label="Copy diff" text={handoff.diff} />
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(handoff.diff)}`}
              download={patchFile}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Download .patch
            </a>
          </div>
          <CodeBlock>{handoff.diff}</CodeBlock>
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">
          No patch available for this finding yet.
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-2">
        <CopyButton label="Copy PR body" text={handoff.body} />
        <a
          href={`data:text/markdown;charset=utf-8,${encodeURIComponent(handoff.body)}`}
          download={prFile}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Download PR markdown
        </a>
      </div>
      <CodeBlock>{handoff.body}</CodeBlock>

      {canCreatePr ? <CreatePrForm findingId={findingId} /> : null}
    </Card>
  );
}
