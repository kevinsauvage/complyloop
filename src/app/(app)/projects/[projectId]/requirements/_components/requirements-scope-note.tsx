import Link from "next/link";

import { projectPath } from "@/core/routes";

/**
 * The framework scope is chosen once, in Settings — this page only reports
 * which one the list below is scored against.
 */
export function RequirementsScopeNote({
  projectId,
  scopeName,
}: {
  projectId: string;
  scopeName: string;
}) {
  return (
    <div className="px-3 text-xs text-muted-foreground">
      <p className="mb-1 font-semibold tracking-wide uppercase">
        Framework scope
      </p>
      <p className="text-sm font-medium text-foreground">{scopeName}</p>
      <Link
        href={projectPath(projectId, "settings")}
        className="mt-1 inline-block underline underline-offset-4 hover:text-foreground"
      >
        Change in Settings
      </Link>
    </div>
  );
}
