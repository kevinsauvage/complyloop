import { PageHeader } from "@/components/page-primitives";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy Policy"
        description="How ComplyLoop handles account, repository, and compliance data. Draft for early access."
      />
      <div className="flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-base font-medium text-foreground">What we store</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>GitHub account identity (user id, login) when you sign in</li>
            <li>
              Encrypted GitHub tokens (user OAuth or App installation tokens) for
              clone, PR, and Checks
            </li>
            <li>
              Cloned repository workspaces under the server <code className="font-mono text-xs text-foreground">DATA_DIR</code>
            </li>
            <li>
              Assessments, findings, remediations, exceptions, and append-only
              evidence for connected projects
            </li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-medium text-foreground">Retention</h2>
          <p className="mt-2">
            Evidence is append-only and retained for the life of the project
            record. Disconnecting a GitHub project removes the local clone and
            project-scoped mutable records; evidence tied to that project may be
            retained for audit history until deleted by an operator.
          </p>
        </section>
        <section>
          <h2 className="text-base font-medium text-foreground">Subprocessors</h2>
          <p className="mt-2">
            Optional AI features send finding context to the configured AI
            gateway when <code className="font-mono text-xs text-foreground">AI_GATEWAY_API_KEY</code> is set. Error reporting
            may send diagnostics to Sentry when <code className="font-mono text-xs text-foreground">SENTRY_DSN</code> is set.
            Hosting and Postgres providers hold application data when you deploy
            with those services.
          </p>
        </section>
      </div>
    </>
  );
}
