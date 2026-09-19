import type { Metadata } from "next";

import {
  PageContent,
  PageHeader,
} from "@/components/primitives/page-primitives";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for early access to ComplyLoop.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        title="Terms of Service"
        description="Terms for early access to ComplyLoop."
      />
      <PageContent>
        <p className="text-xs text-muted-foreground">
          Last updated: 2026-09-10
        </p>
        <div className="surface-panel rounded-xl p-6 text-sm leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Using ComplyLoop</h2>
          <p className="mt-2">
            By using ComplyLoop you agree that the service analyzes source code
            and compliance artifacts you connect, stores assessment results and
            evidence, and may create pull requests when you ask it to.
          </p>
          <h2 className="mt-6 text-lg font-semibold">Your responsibilities</h2>
          <p className="mt-2">
            You remain responsible for reviewing remediations before merge, for
            the accuracy of human decisions and exceptions, and for ensuring you
            have rights to connect each repository.
          </p>
          <h2 className="mt-6 text-lg font-semibold">Early access</h2>
          <p className="mt-2">
            The service is provided as-is during early access. Do not rely on it
            as the sole source of legal compliance advice.
          </p>
        </div>
      </PageContent>
    </div>
  );
}
