import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy Policy"
        description="How ComplyLoop handles account, repository, and compliance data. Draft for early access."
      />
      <div className="flex flex-col gap-4 text-sm text-zinc-700">
        <section>
          <h2 className="text-base font-medium text-zinc-900">What we store</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>GitHub account identity (user id, login) when you sign in</li>
            <li>
              Encrypted GitHub tokens (user OAuth or App installation tokens) for
              clone, PR, and Checks
            </li>
            <li>
              Cloned repository workspaces under the server <code>DATA_DIR</code>
            </li>
            <li>
              Assessments, findings, remediations, exceptions, and append-only
              evidence for connected projects
            </li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-medium text-zinc-900">Retention</h2>
          <p className="mt-2">
            Evidence is append-only and retained for the life of the project
            record. Disconnecting a GitHub project removes the local clone and
            project-scoped mutable records; evidence tied to that project may be
            retained for audit history until deleted by an operator.
          </p>
        </section>
        <section>
          <h2 className="text-base font-medium text-zinc-900">Subprocessors</h2>
          <p className="mt-2">
            Optional AI features send finding context to the configured AI
            gateway when <code>AI_GATEWAY_API_KEY</code> is set. Error reporting
            may send diagnostics to Sentry when <code>SENTRY_DSN</code> is set.
            Hosting and Postgres providers hold application data when you deploy
            with those services.
          </p>
        </section>
      </div>
    </>
  );
}
