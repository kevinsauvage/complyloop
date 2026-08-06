"use client";

import { useActionState, useId } from "react";
import type { CreateOrgFormState } from "@/server/actions";

const initial: CreateOrgFormState = { error: null };

export function CreateOrgForm({
  action,
}: {
  action: (
    previous: CreateOrgFormState,
    formData: FormData,
  ) => Promise<CreateOrgFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const errorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="orgName" className="mb-1 block text-xs font-medium text-zinc-600">
          Organization name
        </label>
        <input
          id="orgName"
          name="name"
          type="text"
          required
          placeholder="Acme Engineering"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
      {state.error ? (
        <p id={errorId} className="basis-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
