/**
 * Chart colors for per-group value/breakdown visuals.
 *
 * Each group gets its own distinct, non-blue identity color (used for its
 * equities band and dashboard breakdown swatch). Blue is reserved for cash —
 * matching the cash color (`--info`) in the Total value card — with a
 * different shade per group so stacked cash bands stay distinguishable.
 */

/** Per-group identity colors — distinct, non-blue. */
export const GROUP_PALETTE = [
  "#c9512e", // terracotta
  "#2f6f4a", // forest green
  "#b88a3e", // ochre
  "#7d5a86", // muted plum
  "#a8442c", // brick
  "#5f8c6b", // sage
  "#8a7355", // warm brown
  "#9a9488", // warm grey
];

/** Cash band colors — shades of blue, anchored on the `--info` cash color. */
export const CASH_PALETTE = [
  "#6b8eb0", // light blue
  "#4a6b8a", // --info
  "#37516b", // deep blue
  "#8aa8c4", // pale blue
  "#5a7d9e", // mid blue
  "#2c3e52", // navy
  "#7d9bb8", // dusty blue
  "#42607d", // steel blue
];

/** Identity color for the group at `index`, cycling through the palette. */
export function groupColor(index: number): string {
  return GROUP_PALETTE[index % GROUP_PALETTE.length];
}

/** Cash-band blue for the group at `index`, cycling through the palette. */
export function cashColor(index: number): string {
  return CASH_PALETTE[index % CASH_PALETTE.length];
}
