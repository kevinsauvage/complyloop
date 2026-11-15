import { RailNav } from "@/components/primitives/rail-nav";
import {
  type FindingListParams,
  findingsListHref,
  type FindingsTab,
} from "@/core/filter-params/findings";

const TABS: ReadonlyArray<{ tab: FindingsTab; label: string }> = [
  { tab: "open", label: "Open" },
  { tab: "resolved", label: "Resolved" },
  { tab: "dismissed", label: "Dismissed" },
];

/** Finding lifecycle as a lateral rail (see `RailNav`). */
export function FindingsStatusNav({
  projectId,
  listParams,
  activeTab,
  totals,
}: {
  projectId: string;
  listParams: FindingListParams;
  activeTab: FindingsTab;
  totals: Record<FindingsTab, number>;
}) {
  return (
    <RailNav
      aria-label="Finding status"
      heading="Status"
      items={TABS.map(({ tab, label }) => ({
        key: tab,
        href: findingsListHref(projectId, { ...listParams, tab, page: 1 }),
        label,
        count: totals[tab],
        current: activeTab === tab,
      }))}
    />
  );
}
