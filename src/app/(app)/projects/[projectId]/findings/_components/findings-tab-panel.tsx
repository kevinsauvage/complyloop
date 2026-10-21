import type { ReactNode } from "react";

import { EmptyState } from "@/components/primitives/page-primitives";
import { PaginationNav } from "@/components/primitives/pagination-nav";
import type {
  FindingListParams,
  FindingsTab,
} from "@/core/filter-params/findings";
import { DEFAULT_PAGE_SIZE } from "@/core/filter-params/pagination";
import { projectPath } from "@/core/routes";

import type { FindingListItem } from "./finding-list-items";
import { FindingsBulkList } from "./findings-bulk-list";
import { FindingsFilterBar } from "./findings-filter-bar";
import { FocusFilterResults } from "./focus-filter-results";

export function FindingsTabPanel({
  projectId,
  tab,
  slice,
  listParams,
  filtersActive,
  items,
  emptyMessage,
  emptyAction,
  filteredEmptyState,
  paginationQuery,
  paginationLabel,
  resultCount,
  resultLabel,
}: {
  projectId: string;
  tab: Extract<FindingsTab, "resolved" | "dismissed">;
  slice: { page: number; totalPages: number; total: number };
  listParams: FindingListParams;
  filtersActive: boolean;
  items: FindingListItem[];
  emptyMessage: string;
  emptyAction?: ReactNode;
  filteredEmptyState: ReactNode;
  paginationQuery: Record<string, string>;
  paginationLabel: string;
  resultCount: number;
  resultLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FindingsFilterBar
        projectId={projectId}
        params={{ ...listParams, tab }}
      />
      <h2
        id="findings-results"
        tabIndex={-1}
        className="text-sm font-medium text-muted-foreground outline-none"
      >
        {resultCount === 1
          ? `1 ${resultLabel} finding`
          : `${resultCount} ${resultLabel} findings`}
      </h2>
      <FocusFilterResults targetId="findings-results" />
      {slice.total === 0 ? (
        filtersActive ? (
          filteredEmptyState
        ) : (
          <EmptyState
            title={
              tab === "resolved"
                ? "All clear — nothing resolved yet"
                : "No dismissed findings yet"
            }
            variant={tab === "resolved" ? "all-clear" : "default"}
            action={emptyAction}
          >
            {emptyMessage}
          </EmptyState>
        )
      ) : (
        <>
          <FindingsBulkList
            projectId={projectId}
            items={items}
            canRemediate={false}
            listParams={{ ...listParams, tab }}
          />
          <PaginationNav
            page={slice.page}
            totalPages={slice.totalPages}
            total={slice.total}
            basePath={projectPath(projectId, "findings")}
            query={paginationQuery}
            label={paginationLabel}
            pageSize={DEFAULT_PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
