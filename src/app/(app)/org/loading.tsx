import { RouteLoadingStatus } from "@/components/loading-placeholders";

export default function OrgLoading() {
  return (
    <RouteLoadingStatus
      label="Loading organization"
      steps={["Loading organization…", "Preparing view…"]}
    />
  );
}
