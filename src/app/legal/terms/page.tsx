import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <>
      <PageHeader
        title="Terms of Service"
        description="Draft terms for early access to ComplyLoop. Replace with counsel-reviewed terms before selling."
      />
      <div className="prose prose-zinc max-w-none text-sm text-zinc-700">
        <p>
          By using ComplyLoop you agree that the service analyzes source code and
          compliance artifacts you connect, stores assessment results and
          evidence, and may create pull requests when you ask it to.
        </p>
        <p>
          You remain responsible for reviewing remediations before merge, for
          the accuracy of human decisions and exceptions, and for ensuring you
          have rights to connect each repository.
        </p>
        <p>
          The service is provided as-is during early access. Do not rely on it as
          the sole source of legal compliance advice.
        </p>
      </div>
    </>
  );
}
