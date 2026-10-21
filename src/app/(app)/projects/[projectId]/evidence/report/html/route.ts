// Colocated with the evidence page on purpose: this download endpoint serves
// that page's export menu (route handlers don't inherit layouts, so the (app)
// group here is organizational only).
import { loadReportInput } from "@/server/reporting/report";
import {
  buildAuditReportHtml,
  buildEngineeringReportHtml,
} from "@/server/reporting/report-html/report";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;
  const context = await loadReportInput(request, projectId);
  if (!context.ok) return context.response;

  const { view, input } = context;
  const nonce = request.headers.get("x-nonce") ?? undefined;
  const html =
    view === "engineering"
      ? buildEngineeringReportHtml(input, nonce)
      : buildAuditReportHtml(input, nonce);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
