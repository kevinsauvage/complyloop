"use client";

import { useActionState } from "react";

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
