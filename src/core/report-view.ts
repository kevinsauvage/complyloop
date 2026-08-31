export type ReportView = "engineering" | "audit";

export function parseReportViewParam(
  raw: string | null | undefined,
): ReportView {
  if (raw === "engineering") return "engineering";
  return "audit";
}

export function reportMarkdownHref(view: ReportView): string {
  return `/evidence/report?view=${view}`;
}

export function reportHtmlHref(view: ReportView): string {
  return `/evidence/report/html?view=${view}`;
}
