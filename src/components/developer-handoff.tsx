import { CopyButton } from "@/components/copy-button";
import { CreatePrForm } from "@/components/create-pr-form";
import { CodeBlock } from "@/components/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Developer handoff (patch / PR)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Copy a unified diff and a pull-request body into your normal git
          workflow, or create a branch/PR when the project root is a git
          repository.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{handoff.title}</p>
          <CopyButton label="Copy title" text={handoff.title} />
        </div>

        {handoff.diff ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <CopyButton label="Copy diff" text={handoff.diff} />
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(handoff.diff)}`}
                  download={patchFile}
                >
                  Download .patch
                </a>
              </Button>
            </div>
            <CodeBlock>{handoff.diff}</CodeBlock>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No patch available for this finding yet.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <CopyButton label="Copy PR body" text={handoff.body} />
            <Button variant="outline" size="sm" asChild>
              <a
                href={`data:text/markdown;charset=utf-8,${encodeURIComponent(handoff.body)}`}
                download={prFile}
              >
                Download PR markdown
              </a>
            </Button>
          </div>
          <CodeBlock>{handoff.body}</CodeBlock>
        </div>

        {canCreatePr ? <CreatePrForm findingId={findingId} /> : null}
      </CardContent>
    </Card>
  );
}
