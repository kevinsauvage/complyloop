import { loadReportInput } from "@/server/reporting/report";
import { buildAuditReportHtml, buildEngineeringReportHtml } from "@/server/reporting/report-html/report";

export async function GET(request: Request): Promise<Response> {
  const context = await loadReportInput(request);
  if (!context.ok) return context.response;

  const { view, input } = context;
  const html =
    view === "engineering"
      ? buildEngineeringReportHtml(input)
      : buildAuditReportHtml(input);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
