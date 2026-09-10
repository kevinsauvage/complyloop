import "server-only";
import {
  projectCapabilities,
  type ProjectCapabilities,
} from "./project-capabilities";
import { getWorkspace, type Workspace } from "./workspace";

export interface ActiveProjectPage extends Workspace {
  caps: ProjectCapabilities;
}

export async function loadActiveProjectPage(): Promise<ActiveProjectPage> {
  const workspace = await getWorkspace();
  return {
    ...workspace,
    caps: projectCapabilities(
      workspace.project,
      workspace.access,
      workspace.activeOrgId,
    ),
  };
}
