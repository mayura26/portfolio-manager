import { CURRENCIES } from "@/lib/currencies";

type Props = {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
};

export function CurrencySelect({
  id,
  name,
  defaultValue = "USD",
  required,
}: Props) {
  return (
    <select
      id={id ?? name}
      name={name}
      defaultValue={defaultValue}
      required={required}
      className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:border-border-strong"
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
