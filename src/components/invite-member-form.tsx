"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  emptyActionMessageState,
  type ActionMessageState,
} from "@/server/action-state";

export function InviteMemberForm({
  action,
  orgId,
  canAssignAdmin = false,
}: {
  action: (
    previous: ActionMessageState,
    formData: FormData,
  ) => Promise<ActionMessageState>;
  orgId: string;
  /** Owners may invite admins; admins may only invite member/viewer. */
  canAssignAdmin?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    emptyActionMessageState,
  );
  useActionToast(state, pending);

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
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          defaultValue="member"
          className={nativeSelectClass}
        >
          {canAssignAdmin ? <option value="admin">Admin</option> : null}
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
    </form>
  );
}
