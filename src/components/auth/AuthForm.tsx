"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/client/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { UserProfile } from "@/lib/types";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email, password } : { email, name, password };
      const res = await api.post<{ user: UserProfile }>(path, body);
      router.push(res.user.onboardedAt ? "/app" : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {error && <Alert tone="danger">{error}</Alert>}

      {mode === "register" && (
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Trader"
            autoComplete="name"
            required
            maxLength={60}
          />
        </Field>
      )}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint={mode === "register" ? "At least 8 characters, with a letter and a number." : undefined}
      >
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>

      <p className="text-center text-[11.5px] text-ink-3">
        {mode === "login" ? (
          <>
            New to TRADIA AI?{" "}
            <Link href="/register" className="text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>

      {mode === "register" && (
        <p className="pt-1 text-center text-[10px] leading-relaxed text-ink-4">
          By creating an account you accept that TRADIA AI provides analysis and educational information
          only, and does not guarantee trading results.
        </p>
      )}
    </form>
  );
}
