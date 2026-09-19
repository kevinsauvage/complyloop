import type { Metadata } from "next";
import Link from "next/link";

import { isGitHubAuthConfigured } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { getSession } from "@/server/auth-session";

import { MarketingFooter } from "./(marketing)/_components/marketing-footer";
import { MarketingHeader } from "./(marketing)/_components/marketing-header";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The requested page does not exist or you do not have access to it.",
};

export default async function NotFound() {
  const session = isGitHubAuthConfigured() ? await getSession() : null;
  const isSignedIn = Boolean(session?.user);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex min-h-screen flex-col overflow-x-clip">
        <MarketingHeader isSignedIn={isSignedIn} />
        <main
          id="main-content"
          className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-16 sm:px-6"
        >
          <Card className="w-full max-w-lg border-dashed bg-card/50 shadow-none ring-1 ring-border/40">
            <CardHeader className="items-center gap-2 text-center">
              <span
                className="flex size-10 items-center justify-center rounded-full border border-dashed border-signal/40 bg-signal/10"
                aria-hidden
              >
                <span className="size-2 rounded-full bg-signal/60" />
              </span>
              <h1 className="text-base font-medium">Page not found</h1>
              <CardDescription className="max-w-lg text-balance">
                That page does not exist, or you do not have access to it. Check
                the URL or return to the dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center gap-2">
              <Button asChild>
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Home</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <MarketingFooter />
      </div>
    </>
  );
}
