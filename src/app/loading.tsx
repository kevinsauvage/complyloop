import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function Loading() {
  return (
    <RouteLoadingStatus label="Loading" steps={["Preparing ComplyLoop…"]} />
  );
}
