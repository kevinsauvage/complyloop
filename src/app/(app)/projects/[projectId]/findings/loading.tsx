import { RouteLoadingStatus } from "@/components/primitives/loading-placeholders";

export default function FindingsLoading() {
  return (
    <RouteLoadingStatus
      label="Loading findings"
      steps={["Loading findings…", "Preparing view…"]}
    />
  );
}
