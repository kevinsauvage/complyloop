"use server";

import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { parseForm } from "@/core/filters";

const signInInput = z.object({
  callbackUrl: z.string().optional(),
});

function safeCallbackUrl(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export async function signInWithGitHubAction(formData?: FormData): Promise<void> {
  const parsed = parseForm(signInInput, formData ?? new FormData());
  const redirectTo = safeCallbackUrl(parsed.callbackUrl);
  await signIn("github", { redirectTo });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
