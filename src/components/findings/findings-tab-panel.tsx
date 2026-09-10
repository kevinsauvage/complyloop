import { FindingsFilterBar } from "@/components/findings/findings-filter-bar";
import { FindingsBulkList } from "@/components/findings/findings-bulk-list";
import type { FindingListItem } from "@/components/findings/finding-list-items";
import { EmptyState } from "@/components/page-primitives";
import { FocusFilterResults } from "@/components/findings/focus-filter-results";
import { PaginationNav } from "@/components/pagination-nav";
import { DEFAULT_PAGE_SIZE } from "@/core/pagination";
import type {
  FindingListParams,
  FindingsTab,
} from "@/core/finding-list-filter";
import type { ReactNode } from "react";

export function FindingsTabPanel({
  tab,
  slice,
  listParams,
  filtersActive,
  items,
  emptyMessage,
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
          <EmptyState title="No findings">
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
