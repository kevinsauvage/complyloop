export default function FindingDetailLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-7 w-80 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-[26rem] max-w-full animate-pulse rounded-md bg-muted/70" />
        <div className="mt-1 flex flex-wrap gap-2" aria-hidden>
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="surface-panel h-48 animate-pulse rounded-2xl" aria-hidden />
      <div className="surface-panel h-56 animate-pulse rounded-2xl" aria-hidden />
      <p className="text-sm text-muted-foreground">Loading finding…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
