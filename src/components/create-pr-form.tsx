"use client";

import { useActionState } from "react";
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
      <p className="text-sm text-zinc-600">
        Create a git branch, commit the automatable fix, and open a pull request
        when <code className="text-xs">gh</code> is available.
      </p>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Preparing…" : "Create branch / PR"}
        </button>
      </div>
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-emerald-800" role="status">
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
        </p>
      ) : null}
    </form>
  );
}
