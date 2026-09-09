export default function DashboardLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Overview header: title + description + stats + action */}
      <div className="flex flex-col gap-3">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-[28rem] max-w-full animate-pulse rounded-md bg-muted/70" />
        <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface-panel h-20 animate-pulse rounded-2xl" />
          <div className="surface-panel h-20 animate-pulse rounded-2xl" />
          <div className="surface-panel hidden h-20 animate-pulse rounded-2xl sm:block" />
          <div className="surface-panel hidden h-20 animate-pulse rounded-2xl lg:block" />
        </div>
      </div>
      {/* Compliance snapshot */}
      <div className="flex flex-col gap-2">
        <div className="h-5 w-44 animate-pulse rounded-md bg-muted" />
        <div className="surface-panel h-36 animate-pulse rounded-2xl" aria-hidden />
      </div>
      {/* Pipeline + Activity */}
      <div className="flex flex-col gap-2">
        <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
        <div className="surface-panel h-28 animate-pulse rounded-2xl" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
