"use client";

import {
  type CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import type { PriceChartBar, PriceChartRange } from "@/lib/yahoo";

type Props = {
  bars: PriceChartBar[];
  currency: string;
  range: PriceChartRange;
};

const RANGE_OPTIONS: { label: string; value: PriceChartRange }[] = [
  { label: "4H", value: "4h" },
  { label: "1M", value: "1m" },
  { label: "6M", value: "6m" },
  { label: "1Y", value: "1y" },
  { label: "5Y", value: "5y" },
];

export function PriceChartClient({ bars, currency, range }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  }, [currency, data, range]);

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
    </div>
  );
}
