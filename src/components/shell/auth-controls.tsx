"use client";

import { useId } from "react";

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
import { signOutAction } from "@/server/actions/auth";

import { SignInWithGitHubButton } from "./sign-in-with-github-button";

/**
 * Sign-out row for the account menu. The form lives outside the menu item and
 * the item submits it via `onSelect`, so screen readers and keyboards get a
 * full-row target instead of a nested form-in-menu-item.
 */
function SignOutMenuItem() {
  const formId = useId();
  return (
    <>
      <form id={formId} action={signOutAction} className="hidden" aria-hidden />
      <DropdownMenuItem
        className="w-full cursor-pointer px-2 py-2"
        onSelect={(event) => {
          event.preventDefault();
          const form = document.getElementById(formId);
          if (form instanceof HTMLFormElement) form.requestSubmit();
        }}
      >
        Sign out
      </DropdownMenuItem>
    </>
  );
}

export function AuthControls({
  configured,
  user,
}: {
  configured: boolean;
  user: { image: string | null; label: string } | null;
}) {
  if (!configured) {
    return (
      <p className="px-3 text-xs text-muted-foreground">
        GitHub sign-in not configured. Set{" "}
        <code className="font-mono">AUTH_GITHUB_*</code> in{" "}
        <code className="font-mono">.env.local</code>.
      </p>
    );
  }

  if (!user) {
    return (
      <div className="px-3">
        <SignInWithGitHubButton />
      </div>
    );
  }

  const initials = user.label.slice(0, 2).toUpperCase();

  return (
    <div className="px-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start gap-2 px-2 py-1.5"
            aria-label={`Account: ${user.label}`}
          >
            <Avatar className="size-7">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium">{user.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm">{user.label}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <SignOutMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
