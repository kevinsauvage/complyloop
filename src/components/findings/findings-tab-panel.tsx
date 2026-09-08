import { FindingsFilterBar } from "@/components/findings/findings-filter-bar";
import { FindingsBulkList } from "@/components/findings/findings-bulk-list";
import type { FindingListItem } from "@/components/findings/finding-list-items";
import { PaginationNav } from "@/components/pagination-nav";
import { TabsContent } from "@/components/ui/tabs";
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
}) {
  return (
    <TabsContent value={tab} className="mt-4 flex flex-col gap-4">
      <FindingsFilterBar params={{ ...listParams, tab }} />
      {slice.total === 0 ? (
        filtersActive ? (
          filteredEmptyState
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
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
          />
        </>
      )}
    </TabsContent>
  );
}
