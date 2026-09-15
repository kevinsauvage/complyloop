export default function SettingsLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <div className="h-8 w-48 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted/70" />
      </div>
      <div
        className="surface-panel h-40 animate-pulse rounded-2xl"
        aria-hidden
      />
      <div
        className="surface-panel h-40 animate-pulse rounded-2xl"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">Loading settings…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
