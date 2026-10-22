import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function AppGroupLoading() {
  return (
    <RouteLoadingStatus
      label="Loading workspace"
      steps={["Loading workspace…", "Loading project…", "Preparing view…"]}
    />
  );
}
