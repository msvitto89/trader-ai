import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in — TRADIA AI" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Welcome back</h1>
      <p className="mt-1.5 mb-6 text-[12.5px] text-ink-3">
        Sign in to your AI trading workspace.
      </p>
      <AuthForm mode="login" />
    </div>
  );
}
