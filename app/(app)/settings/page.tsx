import { Suspense } from "react";
import { getSettings } from "@/actions/settings";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PushToggle } from "@/components/settings/push-toggle";
import { SettingsForm } from "@/components/settings/settings-form";
import { Skeleton } from "@/components/shared/skeleton";
import { isAuthFullyConfigured } from "@/lib/auth-env";
import { db } from "@/lib/db";

export default function SettingsPage() {
  const authGate = isAuthFullyConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Configuration</p>
        <h1 className="display mt-2 text-4xl text-foreground">Settings</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Global preferences and notification controls.
        </p>
      </header>

      <div className="flex flex-col gap-12">
        <section>
          <h2 className="display mb-4 text-2xl text-foreground">General</h2>
          <Suspense fallback={<Skeleton className="h-40 w-full max-w-xl" />}>
            <GeneralSettings />
          </Suspense>
        </section>

        <section>
          <h2 className="display mb-2 text-2xl text-foreground">
            Push notifications
          </h2>
          <p className="mb-4 max-w-prose text-sm text-muted">
            Receive triggered alerts on your phone or desktop. Requires the app
            to be installed as a PWA on iOS.
          </p>
          <Suspense fallback={<Skeleton className="h-12 w-64" />}>
            <PushSection />
          </Suspense>
        </section>

        {authGate ? (
          <section>
            <h2 className="display mb-2 text-2xl text-foreground">Account</h2>
            <p className="mb-4 max-w-prose text-sm text-muted">
              End your session on this device. You will need to sign in again to
              use the app.
            </p>
            <SignOutButton />
          </section>
        ) : null}
      </div>
    </div>
  );
}

async function GeneralSettings() {
  const settings = await getSettings();
  return (
    <SettingsForm
      defaults={{
        defaultBaseCurrency: settings.defaultBaseCurrency,
        watchlistAiModel: settings.watchlistAiModel,
        watchlistAiReasoning: settings.watchlistAiReasoning,
      }}
    />
  );
}

async function PushSection() {
  const settings = await getSettings();
  const subscriptionCount = await db.pushSubscription.count();
  return (
    <PushToggle
      globallyEnabled={settings.pushEnabled}
      subscriptionCount={subscriptionCount}
    />
  );
}
