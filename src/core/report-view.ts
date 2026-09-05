import { buildHref } from "@/core/query-param.ts";

export type ReportView = "engineering" | "audit";

export function parseReportViewParam(
  raw: string | null | undefined,
): ReportView {
  if (raw === "engineering") return "engineering";
  return "audit";
}

export function reportMarkdownHref(view: ReportView): string {
  return buildHref("/evidence/report", { view });
}

export function reportHtmlHref(view: ReportView): string {
  return buildHref("/evidence/report/html", { view });
}
