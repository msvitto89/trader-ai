import { Suspense } from "react";
import { ChartsWorkspace } from "@/components/charts/ChartsWorkspace";
import { Skeleton } from "@/components/ui";

export default function ChartsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <ChartsWorkspace />
    </Suspense>
  );
}
