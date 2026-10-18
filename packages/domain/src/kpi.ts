/**
 * Hàm tính KPI thuần cho T6 (RPT-004).
 * Quy ước SRS v1.6 §9.6: mẫu số bằng 0 → N/A (null), không mặc định 0%.
 */

/** Tỷ lệ = tử / mẫu; null khi mẫu = 0 (N/A). */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Trung vị; null khi rỗng. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Phân vị p (0 < p <= 1), phương pháp nội suy tuyến tính (giống numpy 'linear').
 * null khi rỗng.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0) return Math.min(...values);
  if (p >= 1) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Số giờ giữa hai mốc ISO; null khi thiếu mốc hoặc completed < started. */
export function hoursBetween(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3_600_000;
}
