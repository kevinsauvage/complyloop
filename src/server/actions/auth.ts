"use server";

import { signIn, signOut } from "@/auth";

function safeCallbackUrl(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export async function signInWithGitHubAction(formData?: FormData): Promise<void> {
  const redirectTo = safeCallbackUrl(formData?.get("callbackUrl") ?? null);
  await signIn("github", { redirectTo });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
