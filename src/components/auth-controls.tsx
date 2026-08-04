import { auth, isGitHubAuthConfigured, signIn, signOut } from "@/auth";

export async function AuthControls() {
  if (!isGitHubAuthConfigured()) {
    return (
      <p className="px-3 text-xs text-zinc-400">
        GitHub sign-in not configured. Set{" "}
        <code className="font-mono">AUTH_GITHUB_*</code> in{" "}
        <code className="font-mono">.env.local</code>.
      </p>
    );
  }

  const session = await auth();

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
        className="px-3"
      >
        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Sign in with GitHub
        </button>
      </form>
    );
  }

  const label = session.user.login ?? session.user.name ?? session.user.email ?? "Signed in";

  return (
    <div className="flex flex-col gap-2 px-3">
      <p className="truncate text-sm font-medium text-zinc-800" title={label}>
        {label}
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
