import { Suspense } from "react";
import { RiskWorkspace } from "@/components/risk/RiskWorkspace";
import { Skeleton } from "@/components/ui";

export default function RiskPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <RiskWorkspace />
    </Suspense>
  );
}
