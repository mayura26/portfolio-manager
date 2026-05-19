"use client";

import { BellOff, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { muteAuditCheck, unmuteAuditCheck } from "@/actions/setup-audit";

type Props = {
  checkKey: string;
  muted: boolean;
};

export function AuditMuteButton({ checkKey, muted }: Props) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(() => {
      void (muted ? unmuteAuditCheck(checkKey) : muteAuditCheck(checkKey));
    });
  };

  const Icon = muted ? Undo2 : BellOff;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1.5 text-xs text-subtle transition-colors hover:text-foreground disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      {muted ? "Unmute" : "Mute"}
    </button>
  );
}
