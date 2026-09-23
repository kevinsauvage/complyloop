import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ComplyLoop — Compliance Engineering",
    template: "%s · ComplyLoop",
  },
  description:
    "From compliance requirement to verified code change and audit evidence.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    // Synced to --background in globals.css (oklch 0.984 0.003 248 / 0.16 0.02 240).
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#060e15" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Nonce from the proxy's CSP (`src/proxy.ts`). next-themes renders an inline
  // theme script; without the nonce a strict `script-src` would block it and
  // the page would flash the wrong theme / drift on hydration.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${jakartaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="complyloop-theme"
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
