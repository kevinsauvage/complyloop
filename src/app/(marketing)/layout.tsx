import type { ReactNode } from "react";

import { isGitHubAuthConfigured } from "@/auth";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { getSession } from "@/server/auth-session";

export default async function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = isGitHubAuthConfigured() ? await getSession() : null;
  const isSignedIn = Boolean(session?.user);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex min-h-screen flex-col overflow-x-clip">
        <MarketingHeader isSignedIn={isSignedIn} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <MarketingFooter />
      </div>
    </>
  );
}
