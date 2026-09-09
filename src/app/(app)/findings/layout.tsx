import type { ReactNode } from "react";

export default function FindingsLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Findings" className="flex min-w-0 flex-col">
      {children}
    </section>
  );
}
