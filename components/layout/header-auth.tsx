"use client";

import { signOut, useSession } from "next-auth/react";

type Props = {
  enabled: boolean;
};

export function HeaderAuth({ enabled }: Props) {
  const { status } = useSession();

  if (!enabled || status !== "authenticated") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="hairline rounded-none border border-border bg-transparent px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
    >
      Sign out
    </button>
  );
}
