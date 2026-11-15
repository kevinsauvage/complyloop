import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function FindingDetailLoading() {
  return (
    <RouteLoadingStatus
      label="Loading finding"
      steps={["Loading finding…", "Preparing view…"]}
    />
  );
}
