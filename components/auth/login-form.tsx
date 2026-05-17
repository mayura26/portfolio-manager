"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { AppLogo } from "@/components/layout/app-logo";

type Props = {
  authEnabled: boolean;
};

function safeRedirectPath(value: string | null, origin: string) {
  if (!value) return "/dashboard";

  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function LoginForm({ authEnabled }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!authEnabled) {
    return (
      <div className="hairline max-w-md border-border bg-surface-elevated px-8 py-10 shadow-sm">
        <AppLogo showSubtitle={false} />
        <h1 className="display mt-2 text-3xl text-foreground">Sign in</h1>
        <p className="mt-4 text-sm text-muted">
          Authentication is not configured. Set{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
            AUTH_SECRET
          </code>
          ,{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
            APP_AUTH_USERNAME
          </code>
          , and{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
            APP_AUTH_PASSWORD
          </code>{" "}
          in the environment, then restart the app.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Continue to app
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTo = safeRedirectPath(callbackUrl, window.location.origin);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      redirectTo,
    });

    setPending(false);

    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }

    if (result?.ok) {
      router.replace(safeRedirectPath(result.url, window.location.origin));
      router.refresh();
      return;
    }

    setError("Something went wrong. Try again.");
  }

  return (
    <div className="hairline w-full max-w-md border-border bg-surface-elevated px-8 py-10 shadow-sm">
      <AppLogo showSubtitle={false} />
      <h1 className="display mt-2 text-3xl text-foreground">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the credentials configured for this deployment.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        {error ? (
          <div
            className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="username" className="label">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
