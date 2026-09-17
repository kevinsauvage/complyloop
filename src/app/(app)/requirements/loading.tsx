import { RouteLoadingStatus } from "@/components/loading-placeholders";

export default function RequirementsLoading() {
  return (
    <RouteLoadingStatus
      label="Loading requirements"
      steps={["Loading requirements…", "Preparing view…"]}
    />
  );
}
