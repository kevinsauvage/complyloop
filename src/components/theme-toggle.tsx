"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // Gate theme-dependent props behind mount: server (and pre-hydration
  // client) render without resolved theme, so emitting aria-pressed from
  // `resolvedTheme` mismatches when the stored theme is dark.
  const [mounted, setMounted] = useState(false);
  // One-shot mount flag (no cascade) so SSR omits `aria-pressed` until the
  // client theme resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = (resolvedTheme ?? theme) === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      className={cn(!compact && "w-full justify-start gap-2")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle light and dark theme"
      aria-pressed={mounted ? isDark : undefined}
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
      {!compact ? (
        <>
          <span className="dark:hidden">Light theme</span>
          <span className="hidden dark:inline">Dark theme</span>
        </>
      ) : null}
    </Button>
  );
}
