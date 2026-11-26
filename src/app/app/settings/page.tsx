import { Suspense } from "react";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { Skeleton } from "@/components/ui";

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SettingsWorkspace />
    </Suspense>
  );
}
