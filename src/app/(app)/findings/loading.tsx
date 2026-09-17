import { RouteLoadingStatus } from "@/components/loading-placeholders";

export default function FindingsLoading() {
  return (
    <RouteLoadingStatus
      label="Loading findings"
      steps={["Loading findings…", "Preparing view…"]}
    />
  );
}
