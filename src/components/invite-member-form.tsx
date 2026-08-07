"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgMemberFormState } from "@/server/actions/org";

const initial: OrgMemberFormState = { error: null };

export function InviteMemberForm({
  action,
  orgId,
}: {
  action: (
    previous: OrgMemberFormState,
    formData: FormData,
  ) => Promise<OrgMemberFormState>;
  orgId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const errorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="githubLogin">GitHub username</Label>
        <Input
          id="githubLogin"
          name="githubLogin"
          type="text"
          autoComplete="off"
          required
          placeholder="octocat"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          defaultValue="member"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      {state.error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
    </form>
  );
}
