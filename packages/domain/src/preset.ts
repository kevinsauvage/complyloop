// Port over the preset catalog. Domain-dependent types only — the catalog's
// framework presets are implemented by the adapters package and injected by
// callers (src/core must not import adapters; see architecture module boundaries).
export interface PresetCatalog {
  /** True when the id names a registered framework preset. */
  isValidPresetId(id: string): boolean;
  /** Preset id used when a project has no valid stored default. */
  defaultConnectPresetId: string;
}