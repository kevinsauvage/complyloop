import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export function renderWithUiProviders(
  ui: ReactElement,
  options?: RenderOptions,
) {
  return render(<TooltipProvider>{ui}</TooltipProvider>, options);
}
