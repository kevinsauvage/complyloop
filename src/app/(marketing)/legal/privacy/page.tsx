import { PageContent, PageHeader } from "@/components/page-primitives";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        title="Privacy Policy"
        description="How ComplyLoop handles account, repository, and compliance data. Draft for early access — not counsel-reviewed."
      />
      <PageContent>
        <div className="surface-panel flex flex-col gap-6 rounded-2xl p-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-medium text-foreground">What we store</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>GitHub account identity (user id, login) when you sign in</li>
              <li>
                Encrypted GitHub tokens (user OAuth or App installation tokens) for
                clone, PR, and Checks
              </li>
              <li>
                Ephemeral clones of connected repositories during assessment,
                remediation, and PR jobs (deleted after each job)
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
              Evidence is append-only and retained for audit history. Disconnecting
              a GitHub project or deleting an organization removes project-scoped
              mutable records (requirements, assessments, findings, remediations,
              alerts); evidence rows remain unless an operator purges them outside
              the app role.
            </p>
          </section>
          <section>
            <h2 className="text-base font-medium text-foreground">
              Export and deletion
            </h2>
            <p className="mt-2">
              Organization owners can download a machine-readable JSON export of
              org-scoped product data and delete the organization from{" "}
              <a href="/org" className="text-foreground underline underline-offset-2">
                Organization account
              </a>
              . Sign-out clears stored encrypted GitHub tokens for that user.
              Support-assisted deletion requests are handled within 30 days for
              early-access pilots (see the support contact on that page when
              configured).
            </p>
          </section>
          <section>
            <h2 className="text-base font-medium text-foreground">Subprocessors</h2>
            <p className="mt-2">
              Optional AI features send finding context to the configured AI
              gateway when <code className="font-mono text-xs text-foreground">AI_GATEWAY_API_KEY</code> is set. Error reporting
              may send diagnostics to Sentry when a Sentry DSN is configured
              (<code className="font-mono text-xs text-foreground">SENTRY_DSN</code> on the server,
              optionally <code className="font-mono text-xs text-foreground">NEXT_PUBLIC_SENTRY_DSN</code> in the browser).
              Hosting and Postgres providers hold application data when you deploy
              with those services.
            </p>
          </section>
        </div>
      </PageContent>
    </div>
  );
}
