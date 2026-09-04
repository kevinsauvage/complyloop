import { PageContent, PageHeader } from "@/components/page-primitives";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        title="Terms of Service"
        description="Draft terms for early access to ComplyLoop. Replace with counsel-reviewed terms before selling."
      />
      <PageContent>
        <div className="surface-panel rounded-2xl p-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            By using ComplyLoop you agree that the service analyzes source code and
            compliance artifacts you connect, stores assessment results and
            evidence, and may create pull requests when you ask it to.
          </p>
          <p className="mt-4">
            You remain responsible for reviewing remediations before merge, for
            the accuracy of human decisions and exceptions, and for ensuring you
            have rights to connect each repository.
          </p>
          <p className="mt-4">
            The service is provided as-is during early access. Do not rely on it as
            the sole source of legal compliance advice.
          </p>
        </div>
      </PageContent>
    </div>
  );
}
