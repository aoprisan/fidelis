/** Format an integer with ro-RO grouping (no decimals). */
export const fmt = (n: number): string =>
  n.toLocaleString("ro-RO", { maximumFractionDigits: 0 });

/** Format with exactly two decimals, ro-RO. */
export const fmt2 = (n: number): string =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
