"use client";

import { useId } from "react";
import { signOutAction } from "@/server/actions/auth";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Sign-out row for the account menu. The form lives outside the menu item and
 * the item submits it via `onSelect`, so screen readers and keyboards get a
 * full-row target instead of a nested form-in-menu-item.
 */
export function SignOutMenuItem() {
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
