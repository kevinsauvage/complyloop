import { RouteLoadingStatus } from "@/components/loading-placeholders";

export default function EvidenceLoading() {
  return (
    <RouteLoadingStatus
      label="Loading evidence"
      steps={["Loading evidence…", "Preparing view…"]}
    />
  );
}
