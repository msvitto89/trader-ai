import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <OnboardingWizard
      initialName={user.name}
      initialPreferences={user.preferences}
      alreadyOnboarded={Boolean(user.onboardedAt)}
    />
  );
}
