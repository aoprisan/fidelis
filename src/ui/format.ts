/** Format an integer with ro-RO grouping (no decimals). */
export const fmt = (n: number): string =>
  n.toLocaleString("ro-RO", { maximumFractionDigits: 0 });

/** Format with exactly two decimals, ro-RO. */
export const fmt2 = (n: number): string =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compact thousands, e.g. 55775 -> "55,8k" (ro-RO decimal comma). */
export const fmtK = (n: number): string => {
  if (Math.abs(n) < 1000) return fmt(n);
  const k = n / 1000;
  const decimals = Math.abs(k) < 100 ? 1 : 0;
  return `${k.toLocaleString("ro-RO", { maximumFractionDigits: decimals })}k`;
};
