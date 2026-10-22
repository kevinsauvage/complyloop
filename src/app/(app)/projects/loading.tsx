import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function ProjectsLoading() {
  return (
    <RouteLoadingStatus
      label="Loading overview"
      steps={["Loading overview…", "Aggregating compliance state…"]}
    />
  );
}
