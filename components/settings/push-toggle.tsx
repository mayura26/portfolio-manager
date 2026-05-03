"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

type Props = {
  initiallyEnabled: boolean;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle({ initiallyEnabled }: Props) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (sub) setEnabled(true);
        })
        .catch(() => undefined);
    }
  }, []);

  async function subscribe() {
    setError(null);
    if (!VAPID_PUBLIC_KEY) {
      setError(
        "VAPID public key is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.",
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notification permission denied.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer.slice(
          key.byteOffset,
          key.byteOffset + key.byteLength,
        ) as ArrayBuffer,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(`Subscribe failed (${res.status})`);
      setEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscribe failed");
    }
  }

  async function unsubscribe() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch("/api/push/subscribe", { method: "DELETE" });
      setEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unsubscribe failed");
    }
  }

  if (supported === false) {
    return (
      <p className="hairline bg-surface px-4 py-3 text-sm text-muted">
        Push notifications aren't supported in this browser.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {enabled ? (
          <button
            type="button"
            onClick={() => startTransition(() => void unsubscribe())}
            disabled={pending}
            className="hairline inline-flex items-center gap-2 px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            <BellOff className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Disable push notifications
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startTransition(() => void subscribe())}
            disabled={pending}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Enable push notifications
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-loss">{error}</p> : null}
      {!VAPID_PUBLIC_KEY ? (
        <p className="text-xs text-warning">
          To enable, generate VAPID keys (e.g.{" "}
          <code className="font-mono">npx web-push generate-vapid-keys</code>)
          and add
          <code className="mx-1 font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,
          <code className="mx-1 font-mono">VAPID_PRIVATE_KEY</code>, and
          <code className="mx-1 font-mono">VAPID_EMAIL</code> to{" "}
          <code className="font-mono">.env</code>.
        </p>
      ) : null}
    </div>
  );
}
