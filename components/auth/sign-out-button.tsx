"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="hairline rounded-none border border-border bg-transparent px-4 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
    >
      Sign out
    </button>
  );
}
