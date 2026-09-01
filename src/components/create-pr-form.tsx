"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ActionFeedback } from "@/components/action-feedback";
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
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const key = state.error
      ? `error:${state.error}`
      : state.message
        ? `message:${state.message}:${state.prUrl ?? ""}`
        : null;
    if (key == null || key === lastKey.current) return;
    lastKey.current = key;

    if (state.error) {
      toast.error(state.error, { duration: 8_000 });
      return;
    }
    if (state.message) {
      toast.success(state.message, {
        duration: 6_000,
        action: state.prUrl
          ? {
              label: "Open draft PR",
              onClick: () => {
                window.open(state.prUrl!, "_blank", "noopener,noreferrer");
              },
            }
          : undefined,
      });
    }
  }, [state.error, state.message, state.prUrl]);

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
      {state.error ? (
        <ActionFeedback state={{ error: state.error, message: null }} />
      ) : state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
          {state.prUrl ? (
            <>
              {" "}
              <a
                href={state.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Open pull request
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
