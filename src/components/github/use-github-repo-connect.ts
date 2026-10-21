"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import {
  type ActionState,
  initialActionState,
} from "@/core/actions/action-state";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
} from "@/server/actions/connect";

const connectInitial: ActionState = initialActionState;
const disconnectInitial: ActionState = initialActionState;

/** Connect / disconnect Server Action state + toasts for the repo picker. */
export function useGitHubRepoConnect() {
  const [connectState, connectAction, connectPending] = useActionState(
    connectGitHubRepoAction,
    connectInitial,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectGitHubRepoAction,
    disconnectInitial,
  );
  useActionToast(connectState, connectPending);

  // Connecting creates a project: the next step (first assessment) is on that
  // project's dashboard, so follow the destination the action returned rather
  // than leaving the user on the list they came from.
  const router = useRouter();
  const wasConnecting = useRef(false);
  useEffect(() => {
    const finished = wasConnecting.current && !connectPending;
    wasConnecting.current = connectPending;
    if (finished && connectState.ok && connectState.redirectTo) {
      router.push(connectState.redirectTo as Route);
    }
  }, [connectPending, connectState.ok, connectState.redirectTo, router]);
  useActionToast(disconnectState, disconnectPending);

  return {
    connectState,
    connectAction,
    connectPending,
    disconnectState,
    disconnectAction,
    disconnectPending,
  };
}
