import { auth, isGitHubAuthConfigured } from "@/auth";
import { signInWithGitHubAction, signOutAction } from "@/server/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function AuthControls() {
  if (!isGitHubAuthConfigured()) {
    return (
      <p className="px-3 text-xs text-muted-foreground">
        GitHub sign-in not configured. Set{" "}
        <code className="font-mono">AUTH_GITHUB_*</code> in{" "}
        <code className="font-mono">.env.local</code>.
      </p>
    );
  }

  const session = await auth();

  if (!session?.user) {
    return (
      <form action={signInWithGitHubAction} className="px-3">
        <input type="hidden" name="callbackUrl" value="/dashboard" />
        <Button type="submit" className="w-full">
          Sign in with GitHub
        </Button>
      </form>
    );
  }

  const label =
    session.user.login ?? session.user.name ?? session.user.email ?? "Signed in";
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <div className="px-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start gap-2 px-2 py-1.5"
          >
            <Avatar className="size-7">
              {session.user.image ? (
                <AvatarImage src={session.user.image} alt="" />
              ) : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm">{label}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <form action={signOutAction} className="w-full">
              <button type="submit" className="w-full cursor-pointer text-left">
                Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
