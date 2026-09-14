/**
 * Canonical entry point for URL/filter helpers: `@/core/filter-params`.
 *
 * Pure, zod-free URL/filter helpers shared by server and client components.
 * Keep these modules free of validation schemas so client bundles importing
 * `findingsListHref`/`findingDetailHref` do not pull `zod` into the graph.
 * Validation helpers live in `@/core/validate`.
 */

export {
  DEFAULT_PAGE_SIZE,
  type PageSlice,
  pageSliceFromQuery,
  paginateSlice,
  parsePageParam,
} from "./filter-params/pagination";

export {
  parsePresetIdParam,
  parseRequirementStatusParam,
  parseRequirementsQueryParam,
  requirementsPageHref,
  requirementsStatusHref,
} from "./filter-params/requirements";

export {
  EVIDENCE_KIND_FILTER_ORDER,
  type EvidencePageFilters,
  type ReportFormat,
  type ReportView,
  evidenceKindHref,
  evidenceRecordHref,
  parseEvidenceDateParam,
  parseEvidenceKindParam,
  parseEvidenceQueryParam,
  parseReportViewParam,
  reportHref,
} from "./filter-params/evidence";

export type {
  FilterFindingsContext,
  FindingListFilters,
  FindingListParams,
  FindingsTab,
} from "./filter-params/findings";
export {
  filterFindings,
  findingDetailHref,
  findingListPaginationQuery,
  findingQueuePosition,
  findingsListHref,
  hasActiveFindingFilters,
  orderFindingsForList,
  orderedFindingIdsForQueue,
  parseFindingListParams,
} from "./filter-params/findings";
