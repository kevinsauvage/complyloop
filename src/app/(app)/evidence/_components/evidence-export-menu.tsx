import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reportHref } from "@/core/filter-params";

export function EvidenceExportMenu() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="default" size="sm" asChild>
        <a href={reportHref("audit", "markdown")} download>
          Download audit report
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More export formats">
            More formats <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={reportHref("engineering", "markdown")} download>
              <span className="flex flex-col gap-0.5">
                <span>Download engineering report</span>
                <span className="text-xs text-muted-foreground">
                  Markdown for developers fixing findings
                </span>
              </span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={reportHref("audit", "html")}
              target="_blank"
              rel="noreferrer"
            >
              <span className="flex flex-col gap-0.5">
                <span>Open audit report</span>
                <span className="text-xs text-muted-foreground">
                  Auditor-ready HTML in a new tab
                </span>
              </span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={reportHref("engineering", "html")}
              target="_blank"
              rel="noreferrer"
            >
              <span className="flex flex-col gap-0.5">
                <span>Open engineering report</span>
                <span className="text-xs text-muted-foreground">
                  HTML in a new tab
                </span>
              </span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/evidence/export" download="evidence.json">
              <span className="flex flex-col gap-0.5">
                <span>Download raw JSON</span>
                <span className="text-xs text-muted-foreground">
                  Machine-readable export
                </span>
              </span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
