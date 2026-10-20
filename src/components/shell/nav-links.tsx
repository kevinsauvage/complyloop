"use client";

import { Building2, LayoutGrid } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavLink {
  href: Route;
  label: string;
  icon: typeof LayoutGrid;
}

/**
 * Primary (workspace-level) navigation. Everything that acts on one project —
 * dashboard, requirements, findings, evidence, project settings — lives in
 * `ProjectNav`, not here: the sidebar answers "where in my organization am I",
 * the project tabs answer "what am I doing in this project".
 */
const PRIMARY_LINKS: readonly NavLink[] = [
  { href: "/projects" as Route, label: "Overview", icon: LayoutGrid },
  { href: "/org" as Route, label: "Organization", icon: Building2 },
];

/** Project-scoped pages belong to the Overview section of the sidebar. */
const PROJECT_SCOPED_PREFIXES = [
  "/dashboard",
  "/requirements",
  "/findings",
  "/evidence",
  "/settings",
] as const;

export function isProjectScopedPath(pathname: string): boolean {
  return PROJECT_SCOPED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/projects") {
    return pathname.startsWith("/projects") || isProjectScopedPath(pathname);
  }
  return pathname.startsWith(href);
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {PRIMARY_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        const Icon = link.icon;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color] duration-150",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_0] shadow-foreground/[0.04]"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              {active ? (
                <span
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-signal"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-signal" : "text-current opacity-80",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{link.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
