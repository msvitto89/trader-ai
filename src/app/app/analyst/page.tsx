import { Suspense } from "react";
import { AnalystWorkspace } from "@/components/analyst/AnalystWorkspace";
import { Skeleton } from "@/components/ui";

export default function AnalystPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <AnalystWorkspace />
    </Suspense>
  );
}
