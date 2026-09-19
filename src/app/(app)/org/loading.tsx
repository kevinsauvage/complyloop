import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function OrgLoading() {
  return (
    <RouteLoadingStatus
      label="Loading organization"
      steps={["Loading organization…", "Preparing view…"]}
    />
  );
}
