export default function OrgLoading() {
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
      </div>
      <div
        className="surface-panel h-32 animate-pulse rounded-2xl"
        aria-hidden
      />
      <div className="surface-panel rounded-2xl p-4" aria-hidden>
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <li
              key={index}
              className="h-10 animate-pulse rounded-lg bg-muted/60"
            />
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">Loading organization…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
