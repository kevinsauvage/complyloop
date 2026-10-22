import { cn } from "@/lib/utils";

export function filterChipClass(selected: boolean): string {
  return cn(
    "surface-panel flex items-center gap-2 rounded-xl px-2.5 py-1.5 outline-none transition-[border-color,background-color] duration-200",
    "hover:bg-card/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    selected
      ? "border-signal/40 bg-signal/10 font-semibold ring-1 ring-signal/30"
      : "hover:border-signal/25",
  );
}

/** Shared "N empty categories" note for chip filters (§21: explain what is empty). */
export function HiddenCategoriesNote({
  count,
  noun,
}: {
  count: number;
  noun: string;
}) {
  if (count <= 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      No {noun} entries in {count} {count === 1 ? "category" : "categories"} yet
    </p>
  );
}
