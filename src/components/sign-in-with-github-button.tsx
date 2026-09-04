import { Button } from "@/components/ui/button";
import { signInWithGitHubAction } from "@/server/actions/auth";

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
      <Button type="submit" className="w-full">
        {label}
      </Button>
    </form>
  );
}
