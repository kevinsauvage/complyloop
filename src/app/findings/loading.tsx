export default function FindingsLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">Loading findings…</p>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
