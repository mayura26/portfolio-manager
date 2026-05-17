"use client";

import { Bell, BellOff, Send, Smartphone } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { sendTestNotification } from "@/actions/notifications";

type Props = {
  globallyEnabled: boolean;
  subscriptionCount: number;
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

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;

  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Service worker registration timed out.")),
        8000,
      );
    }),
  ]);
}

export function PushToggle({ globallyEnabled, subscriptionCount }: Props) {
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
      window.location.hostname,
    );
    const ok =
      ("serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        (window.isSecureContext || isLocalhost)) ??
      false;

    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);
    getServiceWorkerRegistration()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setDeviceSubscribed(!!sub))
      .catch(() => undefined);
  }, []);

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  async function subscribe() {
    setError(null);
    setSuccess(null);

    if (!VAPID_PUBLIC_KEY) {
      setError(
        "VAPID public key is not configured. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to the environment.",
      );
      return;
    }

    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setError("Notification permission was not granted for this browser.");
        return;
      }

      const reg = await getServiceWorkerRegistration();
      const existing = await reg.pushManager.getSubscription();
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer.slice(
            key.byteOffset,
            key.byteOffset + key.byteLength,
          ) as ArrayBuffer,
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(`Subscribe failed (${res.status})`);

      setDeviceSubscribed(true);
      setSuccess("This device is subscribed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscribe failed");
    }
  }

  async function unsubscribe() {
    setError(null);
    setSuccess(null);

    try {
      const reg = await getServiceWorkerRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setDeviceSubscribed(false);
        setSuccess("This device was already unsubscribed.");
        return;
      }

      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      const res = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok) throw new Error(`Unsubscribe failed (${res.status})`);

      setDeviceSubscribed(false);
      setSuccess("This device is unsubscribed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unsubscribe failed");
    }
  }

  async function testPush() {
    setError(null);
    setSuccess(null);

    const result = await sendTestNotification();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess("Test notification sent.");
  }

  if (supported === false) {
    return (
      <p className="hairline bg-surface px-4 py-3 text-sm text-muted">
        Push notifications require a supported browser on HTTPS or localhost.
      </p>
    );
  }

  return (
    <div className="hairline max-w-xl bg-surface-elevated p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent">
            <Smartphone className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </div>
          <div>
            <p className="text-sm text-foreground">
              {deviceSubscribed
                ? "This device is subscribed."
                : "This device is not subscribed."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {subscriptionCount} saved{" "}
              {subscriptionCount === 1 ? "device" : "devices"}.
              {globallyEnabled ? " Push is enabled." : " Push is disabled."}
            </p>
            {permission === "denied" ? (
              <p className="mt-2 text-xs text-warning">
                Browser permission is denied. Re-enable notifications in site
                settings before subscribing again.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {deviceSubscribed ? (
            <button
              type="button"
              onClick={() => run(unsubscribe)}
              disabled={pending}
              className="hairline inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              <BellOff className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Disable
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run(subscribe)}
              disabled={pending || permission === "denied"}
              className="inline-flex items-center gap-2 bg-accent px-3 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Enable
            </button>
          )}
          <button
            type="button"
            onClick={() => run(testPush)}
            disabled={pending || subscriptionCount === 0}
            className="hairline inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Send test
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-loss">{error}</p> : null}
      {success ? <p className="mt-3 text-xs text-gain">{success}</p> : null}
      {!VAPID_PUBLIC_KEY ? (
        <p className="mt-3 text-xs text-warning">
          To enable push, add{" "}
          <code className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,{" "}
          <code className="font-mono">VAPID_PRIVATE_KEY</code>, and{" "}
          <code className="font-mono">VAPID_EMAIL</code> to the environment.
        </p>
      ) : null}
    </div>
  );
}
