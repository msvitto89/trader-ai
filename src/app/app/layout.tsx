import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { SessionProvider } from "@/lib/client/store";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboardedAt) redirect("/onboarding");

  return (
    <SessionProvider initialUser={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
