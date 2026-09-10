import Link from "next/link";
import type { Metadata } from "next";
import { auth, isGitHubAuthConfigured } from "@/auth";
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
    const session = await auth();
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
                Sign-in with GitHub failed. Please try again — if it keeps
                failing, contact your administrator.
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
