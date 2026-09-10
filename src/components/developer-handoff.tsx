import { CopyButton } from "@/components/copy-button";
import { CodeBlock, EmptyState } from "@/components/page-primitives";
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
}: {
  handoff: DeveloperHandoff;
}) {
  const patchFile = `${handoff.title.replace(/[^\w.-]+/g, "-").toLowerCase()}.patch`;
  const prFile = `${handoff.title.replace(/[^\w.-]+/g, "-").toLowerCase()}-pr.md`;

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-1">
        <CardTitle level={3}>Developer handoff (patch / PR)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Copy a unified diff and pull-request body into your normal git workflow.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="min-w-0 flex-1 text-sm font-medium break-all">{handoff.title}</p>
          <CopyButton label="Copy title" text={handoff.title} />
        </div>

        {handoff.diff ? (
          <div className="flex flex-col gap-3">
            <div className="sticky top-4 z-10 -mx-1 flex flex-wrap gap-2 bg-card/90 px-1 py-1 backdrop-blur-sm">
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
          <EmptyState title="No patch available" className="border-border/60">
            Automated remediation not yet generated for this finding.
          </EmptyState>
        )}

        <div className="flex flex-col gap-3">
          <div className="sticky top-4 z-10 -mx-1 flex flex-wrap gap-2 bg-card/90 px-1 py-1 backdrop-blur-sm">
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

      </CardContent>
    </Card>
  );
}
