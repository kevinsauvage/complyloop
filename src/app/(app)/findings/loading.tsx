export default function FindingsLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="surface-panel h-28 animate-pulse rounded-2xl" aria-hidden />
      <div className="surface-panel h-64 animate-pulse rounded-2xl" aria-hidden />
      <p className="text-sm text-muted-foreground">Loading findings…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
