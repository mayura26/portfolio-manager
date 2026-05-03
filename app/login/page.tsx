import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthFullyConfigured } from "@/lib/auth-env";

export const metadata: Metadata = {
  title: "Sign in",
};

function LoginFormFallback() {
  return (
    <div className="hairline h-[22rem] w-full max-w-md animate-pulse border-border bg-surface-elevated" />
  );
}

export default function LoginPage() {
  const authEnabled = isAuthFullyConfigured();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-background px-4 py-16">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm authEnabled={authEnabled} />
      </Suspense>
    </div>
  );
}
