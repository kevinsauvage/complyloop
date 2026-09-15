import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/page-primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeveloperHandoff } from "@/server/assessment/handoff";

export function DeveloperHandoffCard({
  handoff,
  prUrl = null,
}: {
  handoff: DeveloperHandoff;
  /** When a PR already exists the patch is collapsed to keep the page dense. */
  prUrl?: string | null;
}) {
  const patchFile = `${handoff.title.replace(/[^\w.-]+/g, "-").toLowerCase()}.patch`;
  const prFile = `${handoff.title.replace(/[^\w.-]+/g, "-").toLowerCase()}-pr.md`;

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-1">
        <CardTitle level={3}>Developer handoff (patch / PR)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Copy a unified diff and pull-request body into your normal git
          workflow.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="min-w-0 flex-1 text-sm font-medium break-all">
            {handoff.title}
          </p>
          <CopyButton label="Copy title" text={handoff.title} />
        </div>

        {handoff.diff ? (
          <details
            open={prUrl == null}
            className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2"
          >
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Show patch diff
            </summary>
            <div className="mt-2 flex flex-col gap-3">
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
          </details>
        ) : (
          <EmptyState title="No patch available" className="border-border/60">
            Automated remediation not yet generated for this finding.
          </EmptyState>
        )}

        <details className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Show PR body
          </summary>
          <div className="mt-2 flex flex-col gap-3">
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
            <div className="max-h-96 overflow-auto rounded-xl">
              <CodeBlock>{handoff.body}</CodeBlock>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
