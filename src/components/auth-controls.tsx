import { auth, isGitHubAuthConfigured } from "@/auth";
import { SignInWithGitHubButton } from "@/components/sign-in-with-github-button";
import { SignOutMenuItem } from "@/components/sign-out-menu-item";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
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
      <div className="px-3">
        <SignInWithGitHubButton />
      </div>
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
          <SignOutMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
