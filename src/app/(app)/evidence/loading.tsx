export default function EvidenceLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <div className="h-8 w-48 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="surface-panel rounded-2xl p-4" aria-hidden>
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/15 p-3"
            >
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted/70" />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">Loading evidence…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
