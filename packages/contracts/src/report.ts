/**
 * Wire contract cho Báo cáo/KPI/Xuất file (T6).
 * Nguồn duy nhất cho DTO dùng chung giữa API và web (AGENTS.md §2, §5).
 * SRS v1.6: RPT-001..006.
 */
import type { ExecutionState } from './execution.js';

/** RPT-001: bộ lọc lượt thực hiện (dùng chung cho danh sách, xuất CSV và KPI). */
export interface ExecutionFilterQuery {
  /** Tìm theo mã hoặc tiêu đề lượt (LIKE, không phân biệt hoa/thường). */
  q?: string;
  processId?: string;
  versionId?: string;
  state?: ExecutionState;
  /** Ngày tạo từ (YYYY-MM-DD). */
  from?: string;
  /** Ngày tạo đến (YYYY-MM-DD). */
  to?: string;
  /** Người liên quan: người tạo, người thực hiện chính, hoặc người được phân công bước. */
  userId?: string;
  /** Đơn vị (lọc tường minh; độc lập với scope quyền của người xem). */
  orgUnitId?: string;
  /** true = chỉ lượt có ngoại lệ; false = chỉ lượt không có ngoại lệ. */
  hasException?: boolean;
}

/**
 * RPT-004/RPT-005/RPT-006: một KPI dạng tỷ lệ.
 * - value = null nghĩa là N/A (mẫu số = 0), không phải 0%.
 * - executionIds: tập lượt tạo nên mẫu số (tối đa 50) để drill-down.
 */
export interface KpiRatio {
  /** Mô tả công thức (RPT-006). */
  definition: string;
  value: number | null;
  numerator: number;
  denominator: number;
  executionIds: string[];
}

/** RPT-004: KPI thời gian chu kỳ (giờ, wall-clock). */
export interface KpiCycleTime {
  /** Mô tả công thức (RPT-006). */
  definition: string;
  medianHours: number | null;
  p95Hours: number | null;
  /** Số lượt có đủ dữ liệu (đã hoàn thành + đủ started_at/completed_at). */
  count: number;
  executionIds: string[];
}

/** RPT-004/RPT-006: báo cáo KPI tổng hợp. */
export interface KpiReport {
  /** Thời điểm tính KPI (ISO UTC) — RPT-006. */
  dataTime: string;
  /** Bộ lọc đã áp dụng khi tính — RPT-006. */
  filters: ExecutionFilterQuery;
  /** Tổng số lượt khớp bộ lọc. */
  total: number;
  /** Số lượt theo từng trạng thái. */
  byState: Partial<Record<ExecutionState, number>>;
  completionRate: KpiRatio;
  onTimeRate: KpiRatio;
  evidenceCompleteness: KpiRatio;
  rightFirstTime: KpiRatio;
  cycleTime: KpiCycleTime;
}

/** RPT-003: cột xuất CSV (thứ tự cố định). */
export const EXECUTION_EXPORT_COLUMNS = [
  'ma',
  'tieu_de',
  'quy_trinh',
  'phien_ban',
  'trang_thai',
  'nguoi_tao',
  'ngay_tao',
  'ngay_hoan_thanh',
  'so_buoc',
  'so_ngoai_le',
] as const;

/** Nhãn tiếng Việt cho cột CSV (dòng header). */
export const EXECUTION_EXPORT_HEADERS: Record<(typeof EXECUTION_EXPORT_COLUMNS)[number], string> = {
  ma: 'Mã',
  tieu_de: 'Tiêu đề',
  quy_trinh: 'Quy trình',
  phien_ban: 'Phiên bản',
  trang_thai: 'Trạng thái',
  nguoi_tao: 'Người tạo',
  ngay_tao: 'Ngày tạo',
  ngay_hoan_thanh: 'Ngày hoàn thành (xác nhận)',
  so_buoc: 'Số bước',
  so_ngoai_le: 'Số ngoại lệ',
};

/** RPT-003: một dòng xuất CSV. */
export interface ExecutionExportRow {
  ma: string;
  tieu_de: string;
  quy_trinh: string;
  phien_ban: number;
  trang_thai: string;
  nguoi_tao: string;
  ngay_tao: string;
  ngay_hoan_thanh: string;
  so_buoc: number;
  so_ngoai_le: number;
}
