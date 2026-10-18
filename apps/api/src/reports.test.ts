/**
 * Test T6: Báo cáo/KPI/Xuất file (RPT-001..006).
 * Fake D1Database tối thiểu, dispatch kết quả theo nội dung SQL.
 */
import { describe, expect, it } from 'vitest';
import { buildExecutionFilterConds } from './executionDb.js';
import { buildCsv, computeKpiReport, toExportRow } from './reports.js';

interface RecordedCall {
  sql: string;
  binds: unknown[];
}

function makeFakeDb(dispatch: (sql: string, binds: unknown[]) => unknown[]) {
  const calls: RecordedCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return {
            async run() {
              return { success: true };
            },
            async all<T>() {
              return { results: dispatch(sql, binds) as T[] };
            },
          };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, calls };
}

describe('buildExecutionFilterConds (RPT-001)', () => {
  it('không filter → không có điều kiện', () => {
    const args: unknown[] = [];
    const conds = buildExecutionFilterConds({ orgUnitIds: null }, args);
    expect(conds).toEqual([]);
    expect(args).toEqual([]);
  });

  it('q tìm theo mã và tiêu đề (LIKE, escape ký tự đặc biệt)', () => {
    const args: unknown[] = [];
    const conds = buildExecutionFilterConds({ orgUnitIds: null, q: 'TH-2026%_x' }, args);
    expect(conds.join(' ')).toContain('e.code LIKE');
    expect(conds.join(' ')).toContain('e.title LIKE');
    expect(args[0]).toBe('%TH-2026\\%\\_x%');
    expect(args[1]).toBe('%TH-2026\\%\\_x%');
  });

  it('đủ bộ lọc processId/versionId/state/from/to/userId/orgUnitId/hasException', () => {
    const args: unknown[] = [];
    const conds = buildExecutionFilterConds(
      {
        orgUnitIds: null,
        processId: 'p1',
        versionId: 'v1',
        state: 'APPROVED',
        from: '2026-10-01',
        to: '2026-10-19',
        userId: 'u1',
        orgUnitId: 'kho-hn',
        hasException: true,
      },
      args,
    );
    const sql = conds.join(' AND ');
    expect(sql).toContain('e.process_id = ?');
    expect(sql).toContain('e.version_id = ?');
    expect(sql).toContain('e.state = ?');
    expect(sql).toContain('e.created_at >=');
    expect(sql).toContain('e.created_at <=');
    expect(sql).toContain('e.created_by = ?');
    expect(sql).toContain('e.main_performer_id = ?');
    expect(sql).toContain('es.performer_user_id = ?');
    expect(sql).toContain('e.org_unit_id = ?');
    expect(sql).toContain('EXISTS (SELECT 1 FROM exceptions ex WHERE ex.execution_id = e.id)');
    expect(args).toContain('2026-10-01T00:00:00.000Z');
    expect(args).toContain('2026-10-19T23:59:59.999Z');
  });

  it('hasException=false → NOT EXISTS', () => {
    const args: unknown[] = [];
    const conds = buildExecutionFilterConds({ orgUnitIds: null, hasException: false }, args);
    expect(conds.join(' ')).toContain('NOT EXISTS (SELECT 1 FROM exceptions ex');
  });

  it('orgUnitIds rỗng → 1=0 (không lộ dữ liệu ngoài scope)', () => {
    const args: unknown[] = [];
    const conds = buildExecutionFilterConds({ orgUnitIds: [] }, args);
    expect(conds).toEqual(['1 = 0']);
  });
});

describe('toExportRow + buildCsv (RPT-003)', () => {
  it('map đúng cột và nhãn trạng thái tiếng Việt', () => {
    const row = toExportRow({
      code: 'TH-20261019-0001',
      title: 'Xuất "hàng" đặc biệt',
      process_name: 'Xuất hàng đến đại lý',
      version_no: 1,
      state: 'APPROVED',
      created_by_name: 'Nguyễn Văn A',
      created_at: '2026-10-19T01:00:00.000Z',
      completed_at: '2026-10-19T05:00:00.000Z',
      step_count: 11,
      exception_count: 2,
    });
    expect(row.ma).toBe('TH-20261019-0001');
    expect(row.trang_thai).toBe('Hoàn thành');
    expect(row.so_buoc).toBe(11);
    const csv = buildCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain('Mã,Tiêu đề,Quy trình,Phiên bản,Trạng thái,Người tạo,Ngày tạo');
    // dấu ngoặc kép được escape
    expect(csv).toContain('"Xuất ""hàng"" đặc biệt"');
  });

  it('danh sách rỗng → chỉ có header', () => {
    const csv = buildCsv([]);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});

describe('computeKpiReport (RPT-004/005/006)', () => {
  // Dữ liệu giả: 3 lượt (2 hoàn thành, 1 đang chạy)
  const execs = [
    { id: 'e1', state: 'APPROVED' },
    { id: 'e2', state: 'APPROVED' },
    { id: 'e3', state: 'IN_PROGRESS' },
  ];
  const steps = [
    // e1: 2 bước bắt buộc đều DONE
    { execution_id: 'e1', required: 1, state: 'DONE' },
    { execution_id: 'e1', required: 1, state: 'DONE' },
    // e2: 2 bắt buộc, 1 DONE
    { execution_id: 'e2', required: 1, state: 'DONE' },
    { execution_id: 'e2', required: 1, state: 'PENDING' },
    // e3: 1 bắt buộc DONE
    { execution_id: 'e3', required: 1, state: 'DONE' },
  ];
  const stepEv = [
    { id: 's1', execution_id: 'e1', completion_json: JSON.stringify([{ kind: 'PHOTO', required: true }]) },
    { id: 's2', execution_id: 'e2', completion_json: JSON.stringify([{ kind: 'PHOTO', required: true }]) },
    { id: 's3', execution_id: 'e3', completion_json: JSON.stringify([{ kind: 'NOTE', required: true }]) },
  ];
  const photos = [{ execution_step_id: 's1' }]; // s2 thiếu ảnh
  const rejects = [{ execution_id: 'e2' }]; // e2 từng bị trả làm lại
  const attempts: unknown[] = [];
  const blocking: unknown[] = [];
  const cycle = [
    { id: 'e1', started_at: '2026-10-18T08:00:00.000Z', completed_at: '2026-10-18T10:00:00.000Z' }, // 2h
    { id: 'e2', started_at: '2026-10-18T08:00:00.000Z', completed_at: '2026-10-18T12:00:00.000Z' }, // 4h
  ];

  function dispatch(sql: string) {
    if (sql.includes('es.required, es.state')) return steps;
    if (sql.includes('es.completion_json')) return stepEv;
    if (sql.includes("kind = 'PHOTO'")) return photos;
    if (sql.includes("action = 'reject'")) return rejects;
    if (sql.includes('attempt_no >=')) return attempts;
    if (sql.includes("severity = 'BLOCKING'")) return blocking;
    if (sql.includes('e.started_at')) return cycle;
    if (sql.includes('SELECT e.id FROM executions')) return [{ id: 'e1' }, { id: 'e2' }];
    if (sql.includes('SELECT e.id, e.state FROM executions')) return execs;
    return [];
  }

  it('tính đúng các KPI + definition + dataTime + filters', async () => {
    const { db } = makeFakeDb(dispatch);
    const report = await computeKpiReport(db, { orgUnitIds: null, from: '2026-10-01' });
    expect(report.total).toBe(3);
    expect(report.byState).toEqual({ APPROVED: 2, IN_PROGRESS: 1 });
    // completion_rate = 4/5
    expect(report.completionRate.numerator).toBe(4);
    expect(report.completionRate.denominator).toBe(5);
    expect(report.completionRate.value).toBeCloseTo(0.8, 10);
    expect(report.completionRate.definition).toContain('completion_rate');
    // on_time_rate → N/A
    expect(report.onTimeRate.value).toBeNull();
    expect(report.onTimeRate.denominator).toBe(0);
    // evidence_completeness = 1/2, drill-down = e2 (thiếu ảnh)
    expect(report.evidenceCompleteness.numerator).toBe(1);
    expect(report.evidenceCompleteness.denominator).toBe(2);
    expect(report.evidenceCompleteness.executionIds).toEqual(['e2']);
    // right_first_time: e1 đạt, e2 bị loại (reject) → 1/2
    expect(report.rightFirstTime.numerator).toBe(1);
    expect(report.rightFirstTime.denominator).toBe(2);
    expect(report.rightFirstTime.value).toBe(0.5);
    expect(report.rightFirstTime.executionIds).toEqual(['e1', 'e2']);
    // cycle_time: median 3h, P95 ≈ 3.9h
    expect(report.cycleTime.medianHours).toBe(3);
    expect(report.cycleTime.p95Hours).toBeCloseTo(3.9, 10);
    expect(report.cycleTime.count).toBe(2);
    // RPT-006
    expect(typeof report.dataTime).toBe('string');
    expect(report.filters.from).toBe('2026-10-01');
  });

  it('không có dữ liệu → N/A chứ không 0%', async () => {
    const { db } = makeFakeDb(() => []);
    const report = await computeKpiReport(db, { orgUnitIds: null });
    expect(report.total).toBe(0);
    expect(report.completionRate.value).toBeNull();
    expect(report.rightFirstTime.value).toBeNull();
    expect(report.cycleTime.medianHours).toBeNull();
    expect(report.cycleTime.p95Hours).toBeNull();
  });
});
