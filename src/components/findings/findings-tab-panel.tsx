import type { ReactNode } from "react";

import type { FindingListItem } from "@/components/findings/finding-list-items";
import { FindingsBulkList } from "@/components/findings/findings-bulk-list";
import { FindingsFilterBar } from "@/components/findings/findings-filter-bar";
import { FocusFilterResults } from "@/components/findings/focus-filter-results";
import { EmptyState } from "@/components/page-primitives";
import { PaginationNav } from "@/components/pagination-nav";
import type {
  FindingListParams,
  FindingsTab,
} from "@/core/filter-params";
import { DEFAULT_PAGE_SIZE } from "@/core/filter-params";

export function FindingsTabPanel({
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
    <div className="mt-4 flex flex-col gap-4">
      <FindingsFilterBar params={{ ...listParams, tab }} />
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
            title={tab === "resolved" ? "All clear — nothing resolved yet" : "No findings"}
            variant={tab === "resolved" ? "all-clear" : "default"}
            action={emptyAction}
          >
            {emptyMessage} Nothing to triage here.
          </EmptyState>
        )
      ) : (
        <>
          <FindingsBulkList
            items={items}
            canRemediate={false}
            listParams={{ ...listParams, tab }}
          />
          <PaginationNav
            page={slice.page}
            totalPages={slice.totalPages}
            total={slice.total}
            basePath="/findings"
            query={paginationQuery}
            label={paginationLabel}
            pageSize={DEFAULT_PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
