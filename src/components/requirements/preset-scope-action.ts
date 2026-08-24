/**
 * How applying a preset should be offered, given the project's effective scope.
 * `inScope` must be the effective set (every control id when scope is implicit).
 */
export type PresetScopeAction =
  | { kind: "current" }
  | { kind: "in_scope" }
  | { kind: "narrow"; controlCount: number }
  | { kind: "add"; remaining: number };

export function presetScopeAction(
  preset: { controlIds: readonly string[] },
  inScope: ReadonlySet<string>,
  hasExplicitScope: boolean,
): PresetScopeAction {
  const inScopeCount = preset.controlIds.filter((id) => inScope.has(id)).length;
  const covered = inScopeCount === preset.controlIds.length;

  if (!hasExplicitScope) {
    if (covered && preset.controlIds.length === inScope.size) {
      return { kind: "current" };
    }
    return { kind: "narrow", controlCount: preset.controlIds.length };
  }

  if (covered) return { kind: "in_scope" };
  return { kind: "add", remaining: preset.controlIds.length - inScopeCount };
}
