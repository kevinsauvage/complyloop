export default function RequirementsLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <div className="h-8 w-56 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/70" />
        <div className="flex gap-2" aria-hidden>
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="surface-panel rounded-2xl p-4" aria-hidden>
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <li
              key={index}
              className="h-14 animate-pulse rounded-lg bg-muted/60"
            />
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">Loading requirements…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
