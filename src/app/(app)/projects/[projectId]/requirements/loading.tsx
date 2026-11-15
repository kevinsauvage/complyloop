import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function RequirementsLoading() {
  return (
    <RouteLoadingStatus
      label="Loading requirements"
      steps={["Loading requirements…", "Preparing view…"]}
    />
  );
}
