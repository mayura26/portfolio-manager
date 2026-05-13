"use client";

import {
  type CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PriceChartBar, PriceChartRange } from "@/lib/yahoo";

export type ChartForecast = {
  source: "AI" | "USER";
  isPinned: boolean;
  targetPrice: number;
  lowCase: number | null;
  highCase: number | null;
  streetTargetMean: number | null;
};

export type ChartTradeMarker = {
  time: number;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
};

type Props = {
  bars: PriceChartBar[];
  currency: string;
  range: PriceChartRange;
  forecast: ChartForecast | null;
  userBuyPrice: number | null;
  userSellPrice: number | null;
  trades: ChartTradeMarker[];
};

const RANGE_OPTIONS: { label: string; value: PriceChartRange }[] = [
  { label: "4H", value: "4h" },
  { label: "1M", value: "1m" },
  { label: "6M", value: "6m" },
  { label: "1Y", value: "1y" },
  { label: "5Y", value: "5y" },
];

type Overlay = "targets" | "street" | "trades" | "userTargets";

export function PriceChartClient({
  bars,
  currency,
  range,
  forecast,
  userBuyPrice,
  userSellPrice,
  trades,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    targets: true,
    street: true,
    trades: true,
    userTargets: true,
  });

  const data = useMemo(
    () =>
      bars.map<CandlestickData>((bar) => ({
        time:
          typeof bar.time === "number" ? (bar.time as UTCTimestamp) : bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    [bars],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) return;

    const styles = getComputedStyle(document.documentElement);
    const css = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 288,
      layout: {
        background: {
          type: ColorType.Solid,
          color: css("--surface", "#ffffff"),
        },
        textColor: css("--muted", "#64748b"),
      },
      grid: {
        vertLines: { color: "transparent" },
        horzLines: { color: css("--border", "#e2e8f0") },
      },
      localization: {
        priceFormatter: (price: number) => formatter.format(price),
      },
      rightPriceScale: {
        borderColor: css("--border", "#e2e8f0"),
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: css("--border", "#e2e8f0"),
        timeVisible: range === "4h",
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: css("--success", "#16a34a"),
      downColor: css("--danger", "#dc2626"),
      borderVisible: false,
      wickUpColor: css("--success", "#16a34a"),
      wickDownColor: css("--danger", "#dc2626"),
    });

    series.setData(data);

    if (overlays.targets && forecast) {
      series.createPriceLine({
        price: forecast.targetPrice,
        color: css("--accent", "#2563eb"),
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `Target (${forecast.isPinned ? "pinned" : forecast.source === "USER" ? "yours" : "AI"})`,
      });
      if (forecast.highCase != null) {
        series.createPriceLine({
          price: forecast.highCase,
          color: css("--success", "#16a34a"),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Bull",
        });
      }
      if (forecast.lowCase != null) {
        series.createPriceLine({
          price: forecast.lowCase,
          color: css("--danger", "#dc2626"),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Bear",
        });
      }
    }

    if (overlays.street && forecast?.streetTargetMean != null) {
      series.createPriceLine({
        price: forecast.streetTargetMean,
        color: "#a855f7",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "Street",
      });
    }

    if (overlays.userTargets) {
      if (userSellPrice != null) {
        series.createPriceLine({
          price: userSellPrice,
          color: "#f97316",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "My sell",
        });
      }
      if (userBuyPrice != null) {
        series.createPriceLine({
          price: userBuyPrice,
          color: "#f97316",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "My buy",
        });
      }
    }

    if (overlays.trades && trades.length > 0) {
      const markers: SeriesMarker<UTCTimestamp>[] = trades.map((t) => ({
        time: t.time as UTCTimestamp,
        position: t.type === "BUY" ? "belowBar" : "aboveBar",
        color:
          t.type === "BUY"
            ? css("--success", "#16a34a")
            : css("--danger", "#dc2626"),
        shape: t.type === "BUY" ? "arrowUp" : "arrowDown",
        text: `${t.type === "BUY" ? "B" : "S"} ${t.quantity} @ ${t.price.toFixed(2)}`,
      }));
      createSeriesMarkers(series, markers);
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      chart.resize(Math.floor(entry.contentRect.width), 288);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [
    currency,
    data,
    range,
    forecast,
    overlays,
    userBuyPrice,
    userSellPrice,
    trades,
  ]);

  const selectRange = (nextRange: PriceChartRange) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextRange === "6m") {
      nextParams.delete("range");
    } else {
      nextParams.set("range", nextRange);
    }
    const query = nextParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, {
      scroll: false,
    });
  };

  const toggle = (key: Overlay) =>
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));

  const hasTargets = Boolean(forecast);
  const hasStreet = Boolean(forecast?.streetTargetMean != null);
  const hasUserTargets = userBuyPrice != null || userSellPrice != null;
  const hasTrades = trades.length > 0;

  return (
    <div className="hairline bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-none border border-border">
          {RANGE_OPTIONS.map((option, index) => {
            const active = option.value === range;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => selectRange(option.value)}
                className={[
                  "h-8 min-w-10 border-border px-3 text-xs tabular transition-colors",
                  index < RANGE_OPTIONS.length - 1 ? "border-r" : "",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted hover:bg-surface-elevated hover:text-foreground",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <a
          href="https://www.tradingview.com/lightweight-charts/"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-subtle hover:text-muted"
        >
          Lightweight Charts by TradingView
        </a>
      </div>

      {data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted">
          No price history
        </div>
      ) : (
        <div ref={containerRef} className="h-72 w-full" />
      )}

      {(hasTargets || hasStreet || hasUserTargets || hasTrades) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {hasTargets ? (
            <OverlayChip
              active={overlays.targets}
              onClick={() => toggle("targets")}
              swatch="bg-accent"
              label="Target / Bull / Bear"
            />
          ) : null}
          {hasStreet ? (
            <OverlayChip
              active={overlays.street}
              onClick={() => toggle("street")}
              swatch="bg-[#a855f7]"
              label="Street consensus"
            />
          ) : null}
          {hasUserTargets ? (
            <OverlayChip
              active={overlays.userTargets}
              onClick={() => toggle("userTargets")}
              swatch="bg-[#f97316]"
              label="My buy / sell"
            />
          ) : null}
          {hasTrades ? (
            <OverlayChip
              active={overlays.trades}
              onClick={() => toggle("trades")}
              swatch="bg-foreground"
              label={`${trades.length} trades`}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function OverlayChip({
  active,
  onClick,
  swatch,
  label,
}: {
  active: boolean;
  onClick: () => void;
  swatch: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "hairline flex items-center gap-2 px-2 py-1 transition-colors",
        active
          ? "bg-surface-elevated text-foreground"
          : "text-subtle hover:text-muted",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "inline-block h-2 w-2 rounded-full",
          swatch,
          active ? "" : "opacity-40",
        ].join(" ")}
      />
      {label}
    </button>
  );
}
