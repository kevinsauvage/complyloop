"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
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
      toast.error(state.error);
      return;
    }
    if (state.message) {
      toast.success(state.message, {
        action: state.prUrl
          ? {
              label: "Open PR",
              onClick: () => {
                window.open(state.prUrl!, "_blank", "noopener,noreferrer");
              },
            }
          : undefined,
      });
    }
  }, [state.error, state.message, state.prUrl]);

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
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
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
