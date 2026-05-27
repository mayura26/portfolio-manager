import { useId } from "react";

type Tone = "gain" | "loss" | "neutral";

type Props = {
  values: number[];
  tone?: Tone;
  height?: number;
  ariaLabel?: string;
  className?: string;
};

function toneClass(tone: Tone): string {
  return tone === "gain"
    ? "text-gain"
    : tone === "loss"
      ? "text-loss"
      : "text-muted";
}

export function Sparkline({
  values,
  tone,
  height = 36,
  ariaLabel,
  className,
}: Props) {
  const gradientId = `spark-fill-${useId()}`;
  if (!values || values.length < 2) return null;

  const resolvedTone: Tone =
    tone ??
    (values[values.length - 1] >= values[0]
      ? "gain"
      : values[values.length - 1] < values[0]
        ? "loss"
        : "neutral");

  const width = 300;
  const padY = 2;
  const innerH = height - padY * 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = padY + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L${width.toFixed(2)} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={`${toneClass(resolvedTone)} ${className ?? ""}`.trim()}
      style={{ width: "100%", height, display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
