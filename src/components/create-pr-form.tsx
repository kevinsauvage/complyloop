"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
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
  useActionToast(state, pending, {
    successDuration: 6_000,
    successAction: state.prUrl
      ? {
          label: "Open draft PR",
          onClick: () => {
            window.open(state.prUrl!, "_blank", "noopener,noreferrer");
          },
        }
      : null,
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
    </form>
  );
}
