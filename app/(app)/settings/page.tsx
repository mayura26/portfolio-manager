import { Suspense } from "react";
import { getSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { Skeleton } from "@/components/shared/skeleton";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Configuration</p>
        <h1 className="display mt-2 text-4xl text-foreground">Settings</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Global preferences. Push notifications and key management arrive in Phase 5.
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-40 w-full max-w-xl" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const settings = await getSettings();
  return <SettingsForm defaults={{ defaultBaseCurrency: settings.defaultBaseCurrency }} />;
}
