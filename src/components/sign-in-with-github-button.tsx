"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { signInWithGitHubAction } from "@/server/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Redirecting to GitHub…" : label}
    </Button>
  );
}

export function SignInWithGitHubButton({
  label = "Sign in with GitHub",
  callbackUrl = "/dashboard",
}: {
  label?: string;
  callbackUrl?: string;
}) {
  return (
    <form action={signInWithGitHubAction}>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <SubmitButton label={label} />
    </form>
  );
}
