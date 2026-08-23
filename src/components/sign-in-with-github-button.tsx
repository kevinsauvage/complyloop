import { Button } from "@/components/ui/button";
import { signInWithGitHubAction } from "@/server/actions/auth";

export function SignInWithGitHubButton({
  label = "Sign in with GitHub",
}: {
  label?: string;
}) {
  return (
    <form action={signInWithGitHubAction}>
      <Button type="submit">{label}</Button>
    </form>
  );
}
