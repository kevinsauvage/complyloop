"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileSearch,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requirements", label: "Requirements", icon: ListChecks },
  { href: "/findings", label: "Findings", icon: FileSearch },
  { href: "/evidence", label: "Evidence", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/org", label: "Organization", icon: Building2 },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
