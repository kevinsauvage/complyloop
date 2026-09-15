import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export default function FindingNotFound() {
  return (
    <Card className="border-dashed bg-card/50 shadow-none ring-1 ring-border/40">
      <CardHeader className="items-center gap-2 text-center">
        <span
          className="flex size-10 items-center justify-center rounded-full border border-dashed border-signal/40 bg-signal/10"
          aria-hidden
        >
          <span className="size-2 rounded-full bg-signal/60" />
        </span>
        <h1 className="text-base font-medium">Finding not found</h1>
        <CardDescription className="max-w-lg text-balance">
          That finding does not exist, was resolved and pruned, or belongs to a
          project you cannot access. Return to the list and pick another item
          from the queue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/findings">Back to findings</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
