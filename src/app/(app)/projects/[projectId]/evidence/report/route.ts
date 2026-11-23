// Colocated with the evidence page on purpose: this download endpoint serves
// that page's export menu (route handlers don't inherit layouts, so the (app)
// group here is organizational only).
import { loadReportInput } from "@/server/reporting/report";
import { buildReportMarkdown } from "@/server/reporting/report-markdown";

function sanitizeDownloadFilename(raw: string, fallback = "download"): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/\.\.+/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;
  const context = await loadReportInput(request, projectId);
  if (!context.ok) return context.response;

  const { project, input } = context;
  // Markdown is the engineering view: the handoff engineers paste into a PR or
  // a ticket. The audit artifact is the HTML report.
  const markdown = buildReportMarkdown(input);

  const safeName = sanitizeDownloadFilename(project.name, "project");
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="engineering-report-${safeName}.md"`,
    },
  });
}
