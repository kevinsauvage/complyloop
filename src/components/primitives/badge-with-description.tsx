import type { ReactElement } from "react";

export function BadgeWithDescription({
  description,
  children,
}: {
  description: string;
  children: ReactElement;
}) {
  // Native `title` instead of a Radix hover tooltip: the description works
  // without client JS and for keyboard users, and the sr-only text keeps it
  // in the accessibility tree. Same component API, so callers are unchanged.
  return (
    <span className="inline-flex cursor-help" title={description}>
      {children}
      <span className="sr-only">: {description}</span>
    </span>
  );
}
