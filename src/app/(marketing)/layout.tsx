import { MarketingShell } from "@/components/marketing/marketing-shell";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <MarketingShell>{children}</MarketingShell>;
}
