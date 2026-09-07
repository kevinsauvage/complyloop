export interface CheckGuidance {
  impact: string;
  howToFix: string;
}

export interface FrameworkPreset {
  id: string;
  name: string;
  description: string;
  frameworkId: string;
  /** Catalog control ids (`ctl-*`). Unknown ids fail at construction via `catalogControlIds`. */
  controlIds: readonly string[];
}
