import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isGitHubAuthConfigured } from "@/auth";
import { isProductionRuntime } from "@/auth-secret";
import { SignInWithGitHubButton } from "@/components/shell/sign-in-with-github-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/server/auth-session";
import { isGitHubAppConfigured } from "@/server/github/github-app";

import { authErrorCopy } from "./auth-error-copy";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to ComplyLoop with GitHub to access your compliance dashboard.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" &&
    params.callbackUrl.startsWith("/") &&
    !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/dashboard";
  const authErrorCopyText = authErrorCopy(
    typeof params.error === "string" ? params.error : null,
  );

  if (isGitHubAuthConfigured()) {
    const session = await getSession();
    if (session?.user) {
      redirect(callbackUrl);
    }
  }

  // A fresh sign-in with missing prod App config throws inside the jwt
  // callback and never reaches the Configuration copy above — surface it
  // proactively instead of letting the button explode.
  const showConfigurationError =
    isProductionRuntime() &&
    isGitHubAuthConfigured() &&
    !isGitHubAppConfigured();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-16 sm:px-6">
      <Card className="w-full max-w-md border-border/80 shadow-none">
        <CardHeader className="text-center">
          <CardTitle level={1} className="text-2xl">
            Sign in to ComplyLoop
          </CardTitle>
          <CardDescription>
            Connect with GitHub to access your compliance dashboard, connect
            repositories, and run assessments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {authErrorCopyText ? (
            <Alert variant="destructive">
              <AlertDescription>{authErrorCopyText}</AlertDescription>
            </Alert>
          ) : null}
          {showConfigurationError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {authErrorCopy("Configuration")}
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
