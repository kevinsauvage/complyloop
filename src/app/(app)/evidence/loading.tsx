import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function EvidenceLoading() {
  return (
    <RouteLoadingStatus
      label="Loading evidence"
      steps={["Loading evidence…", "Preparing view…"]}
    />
  );
}
