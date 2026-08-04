"use client";

import { useActionState } from "react";
import {
  connectProjectAction,
  type ConnectFormState,
} from "@/server/actions";

const initialState: ConnectFormState = { error: null };

export function ConnectProjectForm() {
  const [state, action, pending] = useActionState(connectProjectAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Local path or git URL
        <input
          type="text"
          name="target"
          required
          spellCheck={false}
          placeholder="/path/to/my-app or https://github.com/org/repo"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm font-normal"
        />
      </label>
      <p className="text-xs text-zinc-500">
        Local paths are assessed in place (remediations write to that folder).
        Git URLs are shallow-cloned into <code className="font-mono">.data/workspaces/</code>.
      </p>
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Connecting…" : "Connect project"}
        </button>
      </div>
    </form>
  );
}
