import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const { db } = getWorkspace();
  const evidence = [...db.evidence].reverse();

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Append-only record of everything checked, found, changed, and verified."
      >
        <a
          href="/evidence/export"
          download="evidence.json"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Export JSON
        </a>
      </PageHeader>
      {evidence.length === 0 ? (
        <EmptyState title="No evidence yet">
          <p>Evidence accumulates as assessments run and remediations progress.</p>
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th scope="col" className="py-2 pr-4">When</th>
                <th scope="col" className="py-2 pr-4">Event</th>
                <th scope="col" className="py-2">Record</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((record) => (
                <tr key={record.id} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-zinc-500">
                    {formatDateTime(record.at)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">
                      {record.kind}
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-700">{record.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
