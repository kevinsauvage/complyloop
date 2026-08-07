import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="border-dashed bg-card/40 shadow-none">
      <CardHeader className="items-center text-center">
        <h1 className="text-base font-medium">Page not found</h1>
        <CardDescription className="max-w-lg text-balance">
          That page does not exist, or you do not have access to it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild>
          <Link href="/">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
