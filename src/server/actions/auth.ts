"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGitHubAction(): Promise<void> {
  await signIn("github", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
