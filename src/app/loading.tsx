import { RouteLoadingStatus } from "@/components/loading-placeholders";

export default function Loading() {
  return <RouteLoadingStatus label="Loading" steps={["Preparing ComplyLoop…"]} />;
}
