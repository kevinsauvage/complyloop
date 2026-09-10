import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function PermissionNotice({ children }: { children: string }) {
  return (
    <Alert className="border-border/60 bg-muted/40" role="status">
      <Info aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
