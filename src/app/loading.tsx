export default function Loading() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-signal to-signal/40"
          aria-hidden
        />
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted/70" />
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card-sheen h-24 animate-pulse rounded-xl bg-muted/50" />
        <div className="card-sheen h-24 animate-pulse rounded-xl bg-muted/50" />
        <div className="card-sheen hidden h-24 animate-pulse rounded-xl bg-muted/50 lg:block" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
