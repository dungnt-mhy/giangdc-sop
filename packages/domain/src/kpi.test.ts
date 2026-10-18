/** Test T6: hàm tính KPI thuần (RPT-004) — mẫu số 0 → N/A. */
import { describe, expect, it } from 'vitest';
import { hoursBetween, median, percentile, rate } from './kpi.js';

describe('rate', () => {
  it('tỷ lệ thường', () => {
    expect(rate(3, 4)).toBe(0.75);
  });
  it('mẫu số 0 → null (N/A), không 0%', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
  });
  it('tử 0, mẫu > 0 → 0', () => {
    expect(rate(0, 10)).toBe(0);
  });
});

describe('median', () => {
  it('rỗng → null', () => {
    expect(median([])).toBeNull();
  });
  it('lẻ phần tử', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('chẵn phần tử → trung bình 2 giữa', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('percentile', () => {
  it('rỗng → null', () => {
    expect(percentile([], 0.95)).toBeNull();
  });
  it('P95 nội suy tuyến tính', () => {
    // 20 giá trị 1..20: rank = 0.95*19 = 18.05 → 19*0.95 + 20*0.05 = 19.05
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(v, 0.95)).toBeCloseTo(19.05, 10);
  });
  it('p=1 → max, p<=0 → min', () => {
    expect(percentile([5, 1, 9], 1)).toBe(9);
    expect(percentile([5, 1, 9], 0)).toBe(1);
  });
});

describe('hoursBetween', () => {
  it('đủ 2 mốc → số giờ', () => {
    expect(hoursBetween('2026-10-18T08:00:00.000Z', '2026-10-18T10:30:00.000Z')).toBe(2.5);
  });
  it('thiếu mốc → null', () => {
    expect(hoursBetween(null, '2026-10-18T10:30:00.000Z')).toBeNull();
    expect(hoursBetween('2026-10-18T08:00:00.000Z', null)).toBeNull();
  });
  it('completed trước started → null', () => {
    expect(hoursBetween('2026-10-18T10:00:00.000Z', '2026-10-18T08:00:00.000Z')).toBeNull();
  });
});
