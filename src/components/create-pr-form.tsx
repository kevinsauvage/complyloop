"use client";

import { useActionState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  createPullRequestAction,
  type CreatePrFormState,
} from "@/server/actions/pr";
import { emptyActionMessageState } from "@/server/action-state";

const initial: CreatePrFormState = {
  ...emptyActionMessageState,
  prUrl: null,
};

export function CreatePrForm({ findingId }: { findingId: string }) {
  const action = createPullRequestAction.bind(null, findingId);
  const [state, formAction, pending] = useActionState(action, initial);
  const successAction = useMemo(
    () =>
      state.prUrl
        ? {
            label: "Open draft PR",
            onClick: () => {
              window.open(state.prUrl!, "_blank", "noopener,noreferrer");
            },
          }
        : null,
    [state.prUrl],
  );
  useActionToast(state, pending, {
    successDuration: 6_000,
    successAction,
  });

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Commit this patch on a new branch and open a draft pull request for
        review on GitHub.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating draft…" : "Create draft pull request"}
        </Button>
      </div>
      {state.error && !pending ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.prUrl && !pending ? (
        <p className="text-sm">
          <a
            href={state.prUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Open draft PR
          </a>
        </p>
      ) : null}
    </form>
  );
}
