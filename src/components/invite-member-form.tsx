"use client";

import { useActionState } from "react";
import type { OrgMemberFormState } from "@/server/actions";

const initial: OrgMemberFormState = { error: null };

export function InviteMemberForm({
  action,
}: {
  action: (
    previous: OrgMemberFormState,
    formData: FormData,
  ) => Promise<OrgMemberFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="githubLogin" className="mb-1 block text-xs font-medium text-zinc-600">
          GitHub username
        </label>
        <input
          id="githubLogin"
          name="githubLogin"
          type="text"
          autoComplete="off"
          required
          placeholder="octocat"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="role" className="mb-1 block text-xs font-medium text-zinc-600">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue="member"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
      {state.error ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
