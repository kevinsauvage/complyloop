"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelect } from "@/components/role-select";
import { useActionToast } from "@/hooks/use-action-toast";
import { initialActionState, type ActionState } from "@/core/action-state";

export function InviteMemberForm({
  action,
  orgId,
  canAssignAdmin = false,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  orgId: string;
  /** Owners may invite admins; admins may only invite member/viewer. */
  canAssignAdmin?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialActionState,
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
          aria-describedby={
            !state.ok && state.message && !pending
              ? "githubLogin-error"
              : "githubLogin-hint"
          }
          aria-invalid={!state.ok && state.message ? true : undefined}
        />
        <p id="githubLogin-hint" className="text-xs text-muted-foreground">
          GitHub handle without the @ — they must have signed in once with
          GitHub.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <RoleSelect id="role" canAssignAdmin={canAssignAdmin} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
      {!state.ok && state.message && !pending ? (
        <p
          id="githubLogin-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
