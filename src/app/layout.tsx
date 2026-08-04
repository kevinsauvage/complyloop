import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLinks } from "@/components/nav-links";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ComplyLoop — Compliance Engineering",
  description:
    "From compliance requirement to verified code change and audit evidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="flex w-60 shrink-0 flex-col gap-8 border-r border-zinc-200 bg-white px-4 py-6">
            <div className="px-3">
              <p className="text-lg font-semibold tracking-tight">ComplyLoop</p>
              <p className="text-xs text-zinc-500">
                Requirement → Fix → Verified → Evidence
              </p>
            </div>
            <nav aria-label="Main">
              <NavLinks />
            </nav>
            <p className="mt-auto px-3 text-xs text-zinc-400">
              MVP — RGAA / WCAG for React &amp; Next.js
            </p>
          </aside>
          <main className="min-w-0 flex-1 px-8 py-8">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
