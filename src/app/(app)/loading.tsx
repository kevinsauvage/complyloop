export default function AppGroupLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-panel h-24 animate-pulse rounded-2xl" />
        <div className="surface-panel h-24 animate-pulse rounded-2xl" />
        <div className="surface-panel hidden h-24 animate-pulse rounded-2xl sm:block" />
        <div className="surface-panel hidden h-24 animate-pulse rounded-2xl lg:block" />
      </div>
      <div
        className="surface-panel h-64 animate-pulse rounded-2xl"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">Loading workspace…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
