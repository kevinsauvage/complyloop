import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function PermissionNotice({ children }: { children: string }) {
  return (
    <Alert className="border-border/60 bg-muted/40" role="status">
      <Info aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
