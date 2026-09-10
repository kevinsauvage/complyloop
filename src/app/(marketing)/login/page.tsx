import Link from "next/link";
import type { Metadata } from "next";
import { isGitHubAuthConfigured } from "@/auth";
import { getSession } from "@/server/auth-session";
import { SignInWithGitHubButton } from "@/components/sign-in-with-github-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to ComplyLoop with GitHub to access your compliance dashboard.",
};

const AUTH_ERROR_COPY: Record<string, string> = {
  AccessDenied:
    "You denied GitHub access. Retry and approve access to continue.",
  OAuthAccountNotLinked:
    "This GitHub account is already linked to another sign-in method. Use the original method or contact your administrator.",
  Verification:
    "The sign-in attempt expired or was already used. Please try again.",
  Configuration:
    "Sign-in is misconfigured — contact your administrator.",
};

const FALLBACK_AUTH_ERROR_COPY =
  "Sign-in with GitHub failed. Please try again — if it keeps failing, contact your administrator.";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" &&
    params.callbackUrl.startsWith("/") &&
    !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/dashboard";
  const authError =
    typeof params.error === "string" && params.error.length > 0
      ? params.error
      : null;

  if (isGitHubAuthConfigured()) {
    const session = await getSession();
    if (session?.user) {
      redirect(callbackUrl);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-16 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,color-mix(in_oklch,var(--signal)_18%,transparent),transparent)]"
      />

      <Card className="relative w-full max-w-md border-border/80 bg-card/90 card-sheen backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle level={1} className="text-2xl">Sign in to ComplyLoop</CardTitle>
          <CardDescription>
            Connect with GitHub to access your compliance dashboard, connect
            repositories, and run assessments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {authError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {AUTH_ERROR_COPY[authError] ?? FALLBACK_AUTH_ERROR_COPY}
              </AlertDescription>
            </Alert>
          ) : null}
          {isGitHubAuthConfigured() ? (
            <>
              <SignInWithGitHubButton
                label="Continue with GitHub"
                callbackUrl={callbackUrl}
              />
              <p className="text-center text-sm text-muted-foreground">
                We request repository access only when you connect a project.
                OAuth tokens are stored server-side and never exposed to the
                browser.
              </p>
            </>
          ) : (
            <Alert>
              <AlertDescription>
                Sign-in is temporarily unavailable — contact your administrator.
              </AlertDescription>
            </Alert>
          )}

          <div className="text-center">
            <Button asChild variant="link" size="default">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
