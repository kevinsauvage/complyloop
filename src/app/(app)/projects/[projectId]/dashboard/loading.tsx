import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function DashboardLoading() {
  return (
    <RouteLoadingStatus
      label="Loading dashboard"
      steps={[
        "Connecting workspace…",
        "Loading assessments…",
        "Computing snapshot…",
      ]}
    />
  );
}
