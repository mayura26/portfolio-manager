/** Stable color palette for per-group chart series and dashboard breakdowns. */
export const GROUP_PALETTE = [
  "#c9512e",
  "#4a6b8a",
  "#2f6f4a",
  "#b88a3e",
  "#6b6358",
  "#a8442c",
  "#8a8378",
  "#3a4a5a",
];

/** Color for the group at `index`, cycling through the palette. */
export function groupColor(index: number): string {
  return GROUP_PALETTE[index % GROUP_PALETTE.length];
}
