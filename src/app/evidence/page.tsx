import { PaginationNav } from "@/components/pagination-nav";
import { EmptyState, PageHeader, formatDateTime } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { paginateSlice, parsePageParam } from "@/core/pagination";
import { evidenceForProject } from "@/server/project-visibility";
import { getWorkspace } from "@/server/workspace";
import { ChevronDownIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const { db, project } = await getWorkspace();
  if (!project) {
    return (
      <>
        <PageHeader
          title="Evidence"
          description="Append-only record of everything checked, found, changed, and verified."
        />
        <EmptyState title="No project connected">
          <p>Connect a repository from the dashboard to collect evidence.</p>
        </EmptyState>
      </>
    );
  }
  const evidence = [...evidenceForProject(db.evidence, project.id)].reverse();
  const slice = paginateSlice(evidence, parsePageParam(pageRaw));

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Append-only record of everything checked, found, changed, and verified."
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Export <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href="/evidence/report" download>
                Report (Markdown)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/evidence/report/html" target="_blank" rel="noreferrer">
                Report (HTML)
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/evidence/export" download="evidence.json">
                Export JSON
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>
      {evidence.length === 0 ? (
        <EmptyState title="No evidence yet">
          Evidence accumulates as assessments run and remediations progress.
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36 pl-4">When</TableHead>
                  <TableHead className="w-52">Event</TableHead>
                  <TableHead>Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.items.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="pl-4 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(record.at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {record.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.summary}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="border-t px-4 py-3">
            <PaginationNav
              page={slice.page}
              totalPages={slice.totalPages}
              total={slice.total}
              basePath="/evidence"
              label="Evidence pagination"
            />
          </div>
        </Card>
      )}
    </>
  );
}
