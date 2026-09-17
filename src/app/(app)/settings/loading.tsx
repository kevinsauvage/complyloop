import { RouteLoadingStatus } from "@/components/loading-placeholders";

export default function SettingsLoading() {
  return (
    <RouteLoadingStatus
      label="Loading settings"
      steps={["Loading settings…", "Preparing view…"]}
    />
  );
}
