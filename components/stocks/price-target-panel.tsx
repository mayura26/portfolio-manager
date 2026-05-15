import { db } from "@/lib/db";
import { PriceTargetPanelClient } from "./price-target-panel-client";

type Props = {
  instrumentId: string;
  currency: string;
};

export async function PriceTargetPanel({ instrumentId, currency }: Props) {
  const [latest, targetAlerts] = await Promise.all([
    db.priceHistory.findFirst({
      where: { instrumentId },
      orderBy: { date: "desc" },
      select: { close: true },
    }),
    db.alert.findMany({
      where: {
        instrumentId,
        status: "ACTIVE",
        type: { in: ["PRICE_ABOVE", "PRICE_BELOW"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, priceTarget: true, message: true },
    }),
  ]);

  const targets = targetAlerts
    .filter((a) => a.priceTarget != null)
    .map((a) => ({
      id: a.id,
      kind: a.type === "PRICE_ABOVE" ? ("sell" as const) : ("buy" as const),
      price: Number(a.priceTarget),
      note: a.message,
    }));

  return (
    <PriceTargetPanelClient
      instrumentId={instrumentId}
      currency={currency}
      currentPrice={latest ? Number(latest.close) : null}
      targets={targets}
    />
  );
}

export function PriceTargetPanelSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-24" />
    </div>
  );
}
