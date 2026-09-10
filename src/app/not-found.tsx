import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested page does not exist or you do not have access to it.",
};

export default function NotFound() {
  return (
    <Card className="border-dashed bg-card/50 shadow-none ring-1 ring-border/40">
      <CardHeader className="items-center gap-2 text-center">
        <span
          className="flex size-10 items-center justify-center rounded-full border border-dashed border-signal/40 bg-signal/10"
          aria-hidden
        >
          <span className="size-2 rounded-full bg-signal/60" />
        </span>
        <h1 className="text-base font-medium">Page not found</h1>
        <CardDescription className="max-w-lg text-balance">
          That page does not exist, or you do not have access to it. Check the
          URL or return to the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
