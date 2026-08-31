import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AuthControls } from "@/components/auth-controls";
import { ThemeProvider } from "@/components/theme-provider";
import { WorkspaceContext } from "@/components/workspace-context";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { navAttentionCounts } from "@/server/nav-attention";
import { getWorkspace } from "@/server/workspace";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { db, project } = await getWorkspace();
  const navAttention = project
    ? navAttentionCounts(db, project.id)
    : { openFindings: 0, unreadAlerts: 0 };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <TooltipProvider>
            <AppShell
              workspaceContext={<WorkspaceContext />}
              authControls={<AuthControls />}
              navAttention={navAttention}
            >
              {children}
            </AppShell>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
