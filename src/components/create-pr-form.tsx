"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  createPullRequestAction,
  type CreatePrFormState,
} from "@/server/actions/pr";

const initial: CreatePrFormState = {
  error: null,
  message: null,
  prUrl: null,
};

export function CreatePrForm({ findingId }: { findingId: string }) {
  const action = createPullRequestAction.bind(null, findingId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Create a git branch, commit the automatable fix, and open a pull request
        when <code className="text-xs">gh</code> is available.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Preparing…" : "Create branch / PR"}
        </Button>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert className="border-emerald-500/30 bg-emerald-500/10">
          <AlertDescription className="text-emerald-400">
            {state.message}
            {state.prUrl ? (
              <>
                {" "}
                <a
                  href={state.prUrl}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PR
                </a>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
