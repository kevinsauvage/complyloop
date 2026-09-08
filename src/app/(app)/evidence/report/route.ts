import {
  buildAuditReportMarkdown,
  buildEngineeringReportMarkdown,
} from "@/server/report-markdown";
import { loadReportInput } from "@/server/report";

export const dynamic = "force-dynamic";

function sanitizeDownloadFilename(
  raw: string,
  fallback = "download",
): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/\.\.+/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

export async function GET(request: Request): Promise<Response> {
  const context = await loadReportInput(request);
  if (!context.ok) return context.response;

  const { project, view, input } = context;
  const markdown =
    view === "engineering"
      ? buildEngineeringReportMarkdown(input)
      : buildAuditReportMarkdown(input);

  const safeName = sanitizeDownloadFilename(project.name, "project");
  const prefix = view === "engineering" ? "engineering-report" : "audit-report";
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${prefix}-${safeName}.md"`,
    },
  });
}
