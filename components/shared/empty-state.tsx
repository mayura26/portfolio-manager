import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { href: string; label: string };
};

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="hairline flex flex-col items-center justify-center bg-surface px-6 py-16 text-center">
      {Icon ? (
        <Icon
          className="mb-4 h-8 w-8 text-subtle"
          strokeWidth={1.25}
          aria-hidden
        />
      ) : null}
      <h2 className="display text-2xl text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
