import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create account — TRADIA AI" };

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Create your workspace</h1>
      <p className="mt-1.5 mb-6 text-[12.5px] text-ink-3">
        Free plan covers the full loop. No card required.
      </p>
      <AuthForm mode="register" />
    </div>
  );
}
