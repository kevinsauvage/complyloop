"use client";

import { useActionState, useId } from "react";
import {
  connectProjectAction,
  type ConnectFormState,
} from "@/server/actions/connect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ConnectFormState = { error: null };

export function ConnectProjectForm({
  localPathAllowed = true,
}: {
  /** When false, only git URLs are accepted (hosted mode). */
  localPathAllowed?: boolean;
}) {
  const [state, action, pending] = useActionState(connectProjectAction, initialState);
  const errorId = useId();
  const inputId = useId();

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="space-y-2">
        <Label htmlFor={inputId}>
          {localPathAllowed ? "Local path or git URL" : "Git repository URL"}
        </Label>
        <Input
          id={inputId}
          type="text"
          name="target"
          required
          spellCheck={false}
          placeholder={
            localPathAllowed
              ? "/path/to/my-app or https://github.com/org/repo"
              : "https://github.com/org/repo"
          }
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="font-mono"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {localPathAllowed ? (
          <>
            Local paths are assessed in place (remediations write to that folder).
            Git URLs are shallow-cloned into{" "}
            <code className="font-mono">.data/workspaces/</code>.
          </>
        ) : (
          <>
            Git URLs are shallow-cloned into{" "}
            <code className="font-mono">.data/workspaces/</code>. Local path
            connects are disabled on this server.
          </>
        )}
      </p>
      {state.error ? (
        <Alert variant="destructive" id={errorId}>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Connect project"}
        </Button>
      </div>
    </form>
  );
}
