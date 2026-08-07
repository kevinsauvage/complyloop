export default function FindingsLoading() {
  return (
    <div
      className="flex flex-col gap-3 p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">Loading findings…</p>
    </div>
  );
}
