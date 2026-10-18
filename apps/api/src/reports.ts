/**
 * T6 — Báo cáo/KPI/Xuất file (RPT-001..006).
 * - Lọc dùng chung buildExecutionFilterConds (RPT-001).
 * - KPI tính trên cùng tập lượt khớp bộ lọc + scope quyền (RPT-004).
 * - Quy ước: mẫu số 0 → N/A (null).
 */
import type {
  ExecutionExportRow,
  ExecutionFilterQuery,
  ExecutionState,
  KpiCycleTime,
  KpiRatio,
  KpiReport,
} from '@giangdc-sop/contracts';
import { EXECUTION_EXPORT_COLUMNS, EXECUTION_EXPORT_HEADERS } from '@giangdc-sop/contracts';
import { hoursBetween, median, percentile, rate } from '@giangdc-sop/domain';
import { buildExecutionFilterConds, type ListExecutionsFilter } from './executionDb.js';

/** Trạng thái coi là "đã hoàn thành" để tính KPI. */
const COMPLETED_STATES = ['APPROVED', 'COMPLETED'];
/** Số executionIds tối đa trả về cho drill-down (RPT-005). */
const DRILL_DOWN_LIMIT = 50;

function whereOf(f: ListExecutionsFilter): { where: string; args: unknown[] } {
  const args: unknown[] = [];
  const conds = buildExecutionFilterConds(f, args);
  return { where: conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '', args };
}

function safeJsonArray(raw: string | null): { kind: string; required: boolean }[] {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as { kind: string; required: boolean }[]) : [];
  } catch {
    return [];
  }
}

function photoRequiredStep(completionJson: string | null): boolean {
  return safeJsonArray(completionJson).some((c) => c.kind === 'PHOTO' && c.required === true);
}

function kpiRatio(definition: string, numerator: number, denominator: number, executionIds: string[]): KpiRatio {
  return {
    definition,
    value: rate(numerator, denominator),
    numerator,
    denominator,
    executionIds: executionIds.slice(0, DRILL_DOWN_LIMIT),
  };
}

/**
 * Tính toàn bộ KPI trên tập lượt khớp filter (đã áp scope quyền ở tầng route).
 * completedAt của lượt = approved_at, fallback MAX(completed_at) của bước
 * (cho lượt COMPLETED đời cũ chưa có approved_at).
 */
export async function computeKpiReport(db: D1Database, f: ListExecutionsFilter): Promise<KpiReport> {
  const dataTime = new Date().toISOString();
  const filters: ExecutionFilterQuery = {
    ...(f.q ? { q: f.q } : {}),
    ...(f.processId ? { processId: f.processId } : {}),
    ...(f.versionId ? { versionId: f.versionId } : {}),
    ...(f.state ? { state: f.state as ExecutionState } : {}),
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.orgUnitId ? { orgUnitId: f.orgUnitId } : {}),
    ...(f.hasException !== undefined ? { hasException: f.hasException } : {}),
  };

  const { where, args } = whereOf(f);

  // 1) total + byState
  const execRows = await db
    .prepare(`SELECT e.id, e.state FROM executions e ${where}`)
    .bind(...args)
    .all<{ id: string; state: string }>();
  const execs = execRows.results ?? [];
  const total = execs.length;
  const byState: Partial<Record<ExecutionState, number>> = {};
  for (const e of execs) {
    const s = e.state as ExecutionState;
    byState[s] = (byState[s] ?? 0) + 1;
  }

  // 2) completion_rate — aggregate mức bước trên toàn tập lọc.
  // Định nghĩa SRS: bước bắt buộc đã DONE (PASSED/SKIPPED hợp lệ) / tổng bước bắt buộc.
  let requiredDone = 0;
  let requiredTotal = 0;
  const requiredStepExecIds = new Set<string>();
  const stepRows = await db
    .prepare(
      `SELECT es.execution_id, es.required, es.state
       FROM execution_steps es JOIN executions e ON e.id = es.execution_id ${where}`,
    )
    .bind(...args)
    .all<{ execution_id: string; required: number; state: string }>();
  for (const s of stepRows.results ?? []) {
    if (s.required) {
      requiredTotal += 1;
      requiredStepExecIds.add(s.execution_id);
      if (s.state === 'DONE') requiredDone += 1;
    }
  }

  // 3) on_time_rate — không có cột due date trong schema → luôn N/A.
  // 4) evidence_completeness — bước yêu cầu ảnh (PRC-006) đã có ≥1 ảnh / tổng bước yêu cầu ảnh.
  const stepEvRows = await db
    .prepare(
      `SELECT es.id, es.execution_id, es.completion_json
       FROM execution_steps es JOIN executions e ON e.id = es.execution_id ${where}`,
    )
    .bind(...args)
    .all<{ id: string; execution_id: string; completion_json: string | null }>();
  const photoStepIds: string[] = [];
  const photoStepExec = new Map<string, string>();
  for (const s of stepEvRows.results ?? []) {
    if (photoRequiredStep(s.completion_json)) {
      photoStepIds.push(s.id);
      photoStepExec.set(s.id, s.execution_id);
    }
  }
  const satisfiedStepIds = new Set<string>();
  if (photoStepIds.length > 0) {
    const placeholders = photoStepIds.map((_, i) => `?${i + 1}`).join(',');
    const evRows = await db
      .prepare(
        `SELECT execution_step_id FROM evidence WHERE kind = 'PHOTO' AND execution_step_id IN (${placeholders}) GROUP BY execution_step_id`,
      )
      .bind(...photoStepIds)
      .all<{ execution_step_id: string }>();
    for (const r of evRows.results ?? []) satisfiedStepIds.add(r.execution_step_id);
  }
  const unsatisfiedExecIds = [...new Set(photoStepIds.filter((id) => !satisfiedStepIds.has(id)).map((id) => photoStepExec.get(id)!))];

  // 5) right_first_time — lượt hoàn thành (APPROVED/COMPLETED, trừ CANCELLED) không
  // từng bị trả làm lại (reject), không có bước attempt_no >= 2, không có ngoại lệ BLOCKING.
  const { where: wDone, args: aDone } = whereOf(f);
  const doneRows = await db
    .prepare(
      `SELECT e.id FROM executions e ${wDone}${wDone ? ' AND' : ' WHERE'} e.state IN (${COMPLETED_STATES.map((_, i) => `?${aDone.length + i + 1}`).join(',')})`,
    )
    .bind(...aDone, ...COMPLETED_STATES)
    .all<{ id: string }>();
  const doneIds = (doneRows.results ?? []).map((r) => r.id);
  const reworked = new Set<string>();
  if (doneIds.length > 0) {
    const ph = (arr: unknown[], base: number) => arr.map((_, i) => `?${base + i + 1}`).join(',');
    // reject trong nhật ký duyệt (trả làm lại)
    const rejRows = await db
      .prepare(`SELECT DISTINCT execution_id FROM execution_reviews WHERE action = 'reject' AND execution_id IN (${ph(doneIds, 0)})`)
      .bind(...doneIds)
      .all<{ execution_id: string }>();
    for (const r of rejRows.results ?? []) reworked.add(r.execution_id);
    // bước làm lại (attempt_no >= 2)
    const attRows = await db
      .prepare(`SELECT DISTINCT execution_id FROM execution_steps WHERE attempt_no >= 2 AND execution_id IN (${ph(doneIds, 0)})`)
      .bind(...doneIds)
      .all<{ execution_id: string }>();
    for (const r of attRows.results ?? []) reworked.add(r.execution_id);
    // từng mở ngoại lệ BLOCKING
    const blkRows = await db
      .prepare(`SELECT DISTINCT execution_id FROM exceptions WHERE severity = 'BLOCKING' AND execution_id IN (${ph(doneIds, 0)})`)
      .bind(...doneIds)
      .all<{ execution_id: string }>();
    for (const r of blkRows.results ?? []) reworked.add(r.execution_id);
  }
  const rightFirstIds = doneIds.filter((id) => !reworked.has(id));

  // 6) cycle_time — wall-clock completed_at - started_at (giờ), median + P95.
  const ctRows = await db
    .prepare(
      `SELECT e.id, e.started_at,
              COALESCE(e.approved_at, (SELECT MAX(es.completed_at) FROM execution_steps es WHERE es.execution_id = e.id)) AS completed_at
       FROM executions e ${wDone}${wDone ? ' AND' : ' WHERE'} e.state IN (${COMPLETED_STATES.map((_, i) => `?${aDone.length + i + 1}`).join(',')})`,
    )
    .bind(...aDone, ...COMPLETED_STATES)
    .all<{ id: string; started_at: string | null; completed_at: string | null }>();
  const ctHours: number[] = [];
  const ctExecIds: string[] = [];
  for (const r of ctRows.results ?? []) {
    const h = hoursBetween(r.started_at, r.completed_at);
    if (h !== null) {
      ctHours.push(h);
      ctExecIds.push(r.id);
    }
  }
  const cycleTime: KpiCycleTime = {
    definition:
      'cycle_time = completed_at − started_at (wall-clock, giờ); completed_at = approved_at, fallback thời điểm hoàn thành bước cuối (lượt COMPLETED đời cũ). Báo cáo median và P95, không dùng trung bình.',
    medianHours: median(ctHours),
    p95Hours: percentile(ctHours, 0.95),
    count: ctHours.length,
    executionIds: ctExecIds.slice(0, DRILL_DOWN_LIMIT),
  };

  return {
    dataTime,
    filters,
    total,
    byState,
    completionRate: kpiRatio(
      'completion_rate = số bước bắt buộc đã DONE (PASSED/SKIPPED hợp lệ) / tổng số bước bắt buộc của snapshot lượt. Aggregate mức bước trên toàn tập lọc.',
      requiredDone,
      requiredTotal,
      [...requiredStepExecIds],
    ),
    onTimeRate: kpiRatio(
      'on_time_rate = số lượt hoàn thành đúng hạn / số lượt hoàn thành có due date. Schema hiện chưa có cột due date → luôn N/A.',
      0,
      0,
      [],
    ),
    evidenceCompleteness: kpiRatio(
      'evidence_completeness = số bước yêu cầu ảnh (PRC-006) đã có ≥1 ảnh / tổng số bước yêu cầu ảnh. Drill-down liệt kê lượt còn thiếu ảnh.',
      satisfiedStepIds.size,
      photoStepIds.length,
      unsatisfiedExecIds,
    ),
    rightFirstTime: kpiRatio(
      'right_first_time = số lượt hoàn thành không từng bị trả làm lại (reject), không có bước attempt_no ≥ 2, không từng mở ngoại lệ BLOCKING / tổng số lượt hoàn thành (APPROVED/COMPLETED; CANCELLED không nằm trong mẫu số).',
      rightFirstIds.length,
      doneIds.length,
      doneIds,
    ),
    cycleTime,
  };
}

// ---------------------------------------------------------------------------
// RPT-003: xuất CSV
// ---------------------------------------------------------------------------

export interface ExportRowRaw {
  code: string;
  title: string | null;
  process_name: string;
  version_no: number;
  state: string;
  created_by_name: string | null;
  created_at: string;
  completed_at: string | null;
  step_count: number;
  exception_count: number;
}

export async function fetchExportRows(db: D1Database, f: ListExecutionsFilter): Promise<ExportRowRaw[]> {
  const { where, args } = whereOf(f);
  const rows = await db
    .prepare(
      `SELECT e.code, e.title, p.name AS process_name, pv.version_no, e.state,
              u.display_name AS created_by_name, e.created_at,
              COALESCE(e.approved_at, (SELECT MAX(es.completed_at) FROM execution_steps es WHERE es.execution_id = e.id)) AS completed_at,
              (SELECT COUNT(*) FROM execution_steps es WHERE es.execution_id = e.id) AS step_count,
              (SELECT COUNT(*) FROM exceptions ex WHERE ex.execution_id = e.id) AS exception_count
       FROM executions e
       JOIN processes p ON p.id = e.process_id
       JOIN process_versions pv ON pv.id = e.version_id
       LEFT JOIN users u ON u.id = e.created_by
       ${where} ORDER BY e.created_at DESC`,
    )
    .bind(...args)
    .all<ExportRowRaw>();
  return rows.results ?? [];
}

/** Map trạng thái sang nhãn tiếng Việt (đồng bộ với web). */
const STATE_LABEL_VI: Record<string, string> = {
  CREATED: 'Mới tạo',
  IN_PROGRESS: 'Đang thực hiện',
  PAUSED: 'Tạm dừng',
  BLOCKED: 'Bị chặn',
  COMPLETED: 'Hoàn thành',
  PENDING_APPROVAL: 'Chờ xác nhận',
  APPROVED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

export function toExportRow(r: ExportRowRaw): ExecutionExportRow {
  return {
    ma: r.code,
    tieu_de: r.title ?? '',
    quy_trinh: r.process_name,
    phien_ban: r.version_no,
    trang_thai: STATE_LABEL_VI[r.state] ?? r.state,
    nguoi_tao: r.created_by_name ?? '',
    ngay_tao: r.created_at,
    ngay_hoan_thanh: r.completed_at ?? '',
    so_buoc: r.step_count,
    so_ngoai_le: r.exception_count,
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Dựng nội dung CSV (UTF-8 + BOM để Excel mở đúng tiếng Việt). */
export function buildCsv(rows: ExecutionExportRow[]): string {
  const header = EXECUTION_EXPORT_COLUMNS.map((c) => csvCell(EXECUTION_EXPORT_HEADERS[c])).join(',');
  const lines = rows.map((r) => EXECUTION_EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return '﻿' + [header, ...lines].join('\r\n') + '\r\n';
}
