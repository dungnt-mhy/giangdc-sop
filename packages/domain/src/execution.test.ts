import { describe, expect, it } from 'vitest';
import { allRequiredStepsDone, assigneeMatchesPositions, canStartStepByOrder, canStepTransition, canTransition, checkStepAssignees, generateExecutionCode, isValidShift, normalizeExecutionCreate, photoRequired } from './execution.js';

describe('Execution transitions (SRS v1.6 §7.5, Table 5)', () => {
  it('CREATED -> IN_PROGRESS on valid start', () => {
    expect(canTransition('CREATED', 'IN_PROGRESS')).toBe(true);
  });

  it('CREATED -> COMPLETED is forbidden', () => {
    expect(canTransition('CREATED', 'COMPLETED')).toBe(false);
  });

  it('IN_PROGRESS -> BLOCKED when a progress blocker appears', () => {
    expect(canTransition('IN_PROGRESS', 'BLOCKED')).toBe(true);
  });

  it('BLOCKED -> IN_PROGRESS when progress blocker count is 0', () => {
    expect(canTransition('BLOCKED', 'IN_PROGRESS')).toBe(true);
  });

  it('BLOCKED -> COMPLETED is forbidden', () => {
    expect(canTransition('BLOCKED', 'COMPLETED')).toBe(false);
  });

  it('CANCELLED is terminal', () => {
    const states = ['CREATED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED'] as const;
    for (const s of states) {
      expect(canTransition('CANCELLED', s)).toBe(false);
    }
  });

  it('APPROVED is terminal', () => {
    const states = ['CREATED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED'] as const;
    for (const s of states) {
      expect(canTransition('APPROVED', s)).toBe(false);
    }
  });
});

describe('D-15: luồng duyệt lượt thực hiện', () => {
  it('CREATED -> IN_PROGRESS (bắt đầu); IN_PROGRESS -> PAUSED (tạm dừng); PAUSED -> IN_PROGRESS (tiếp tục)', () => {
    expect(canTransition('CREATED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'IN_PROGRESS')).toBe(true);
  });

  it('COMPLETED -> PENDING_APPROVAL (gửi duyệt)', () => {
    expect(canTransition('COMPLETED', 'PENDING_APPROVAL')).toBe(true);
  });

  it('PENDING_APPROVAL -> COMPLETED (hủy duyệt / từ chối)', () => {
    expect(canTransition('PENDING_APPROVAL', 'COMPLETED')).toBe(true);
  });

  it('PENDING_APPROVAL -> APPROVED (duyệt)', () => {
    expect(canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
  });

  it('không cho gửi duyệt từ trạng thái chưa bắt đầu/tạm dừng (D-16: IN_PROGRESS được báo hoàn thành)', () => {
    expect(canTransition('CREATED', 'PENDING_APPROVAL')).toBe(false);
    expect(canTransition('PAUSED', 'PENDING_APPROVAL')).toBe(false);
  });

  it('D-16: IN_PROGRESS -> PENDING_APPROVAL (báo hoàn thành)', () => {
    expect(canTransition('IN_PROGRESS', 'PENDING_APPROVAL')).toBe(true);
  });

  it('D-16: PENDING_APPROVAL -> IN_PROGRESS (hủy báo hoàn thành / từ chối xác nhận)', () => {
    expect(canTransition('PENDING_APPROVAL', 'IN_PROGRESS')).toBe(true);
  });

  it('COMPLETED giữ đường reopen về IN_PROGRESS', () => {
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(true);
  });
});

describe('D-16: bước làm tuần tự (canStartStepByOrder)', () => {
  it('bước đầu (sortOrder nhỏ nhất) luôn mở', () => {
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'PENDING' }, { sortOrder: 2, state: 'PENDING' }], 1,
    )).toBe(true);
  });
  it('bước 2 mở khi bước 1 DONE', () => {
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'DONE' }, { sortOrder: 2, state: 'PENDING' }], 2,
    )).toBe(true);
  });
  it('bước 2 khóa khi bước 1 PENDING', () => {
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'PENDING' }, { sortOrder: 2, state: 'PENDING' }], 2,
    )).toBe(false);
  });
  it('bước 2 khóa khi bước 1 IN_PROGRESS', () => {
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'IN_PROGRESS' }, { sortOrder: 2, state: 'PENDING' }], 2,
    )).toBe(false);
  });
  it('bước tùy chọn chưa DONE vẫn khóa bước sau', () => {
    // Bước 1 là tùy chọn (không required) nhưng chưa DONE -> bước 2 bị khóa.
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'PENDING' }, { sortOrder: 2, state: 'PENDING' }, { sortOrder: 3, state: 'PENDING' }], 2,
    )).toBe(false);
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'DONE' }, { sortOrder: 2, state: 'PENDING' }, { sortOrder: 3, state: 'PENDING' }], 3,
    )).toBe(false);
  });
  it('chỉ cần các bước TRƯỚC đó DONE (bước sau không ảnh hưởng)', () => {
    expect(canStartStepByOrder(
      [{ sortOrder: 1, state: 'DONE' }, { sortOrder: 2, state: 'PENDING' }, { sortOrder: 3, state: 'DONE' }], 2,
    )).toBe(true);
  });
});

describe('Execution step lifecycle (T3, D-12)', () => {
  it('PENDING -> IN_PROGRESS -> DONE', () => {
    expect(canStepTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canStepTransition('IN_PROGRESS', 'DONE')).toBe(true);
  });

  it('PENDING -> DONE trực tiếp bị cấm', () => {
    expect(canStepTransition('PENDING', 'DONE')).toBe(false);
  });

  it('DONE là trạng thái cuối', () => {
    const states = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
    for (const s of states) {
      expect(canStepTransition('DONE', s)).toBe(false);
    }
  });

  it('allRequiredStepsDone: bước tùy chọn PENDING không chặn', () => {
    expect(
      allRequiredStepsDone([
        { required: true, state: 'DONE' },
        { required: false, state: 'PENDING' },
      ]),
    ).toBe(true);
  });

  it('allRequiredStepsDone: bước bắt buộc chưa DONE thì false', () => {
    expect(
      allRequiredStepsDone([
        { required: true, state: 'DONE' },
        { required: true, state: 'IN_PROGRESS' },
      ]),
    ).toBe(false);
  });

  it('photoRequired: chỉ khi có PHOTO bắt buộc', () => {
    expect(photoRequired([{ kind: 'PHOTO', required: true }])).toBe(true);
    expect(photoRequired([{ kind: 'PHOTO', required: false }])).toBe(false);
    expect(photoRequired([{ kind: 'NOTE', required: true }])).toBe(false);
    expect(photoRequired([])).toBe(false);
  });

  it('assigneeMatchesPositions: bước không định nghĩa chức vụ -> ai cũng được', () => {
    expect(assigneeMatchesPositions([], [])).toBe(true);
  });

  it('assigneeMatchesPositions: phải khớp ít nhất 1 chức vụ', () => {
    expect(assigneeMatchesPositions(['pos-thu-kho'], ['pos-thu-kho'])).toBe(true);
    expect(assigneeMatchesPositions(['pos-thu-kho'], ['pos-le-tan'])).toBe(false);
    expect(assigneeMatchesPositions(['pos-thu-kho', 'pos-ql-kho'], ['pos-ql-kho'])).toBe(true);
  });

  it('generateExecutionCode: đúng định dạng TH-YYYYMMDD-XXXX', () => {
    const code = generateExecutionCode(new Date('2026-10-18T00:00:00Z'));
    expect(code).toMatch(/^TH-20261018-[A-Z2-9]{4}$/);
  });
});

describe('D-14: normalizeExecutionCreate', () => {
  it('thiếu tiêu đề -> lỗi TITLE_REQUIRED', () => {
    for (const body of [{}, { title: '' }, { title: '   ' }]) {
      const r = normalizeExecutionCreate(body, 'user-1', '2026-10-18');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('TITLE_REQUIRED');
    }
  });

  it('default: ngày = hôm nay, người tạo = người gọi', () => {
    const r = normalizeExecutionCreate({ title: 'Xuất hàng' }, 'user-1', '2026-10-18');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.executionDate).toBe('2026-10-18');
      expect(r.value.createdBy).toBe('user-1');
      expect(r.value.title).toBe('Xuất hàng');
      expect(r.value.executionTime).toBeNull();
      expect(r.value.shift).toBeNull();
      expect(r.value.mainPerformerId).toBeNull();
      expect(r.value.supervisorId).toBeNull();
    }
  });

  it('giữ nguyên các trường hợp lệ, trim khoảng trắng', () => {
    const r = normalizeExecutionCreate(
      {
        title: '  Xuất hàng sáng  ',
        executionDate: '2026-10-19',
        executionTime: '08:30',
        shift: 'SANG',
        createdBy: 'user-9',
        mainPerformerId: 'user-2',
        supervisorId: 'user-3',
      },
      'user-1',
      '2026-10-18',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe('Xuất hàng sáng');
      expect(r.value.executionDate).toBe('2026-10-19');
      expect(r.value.executionTime).toBe('08:30');
      expect(r.value.shift).toBe('SANG');
      expect(r.value.createdBy).toBe('user-9');
      expect(r.value.mainPerformerId).toBe('user-2');
      expect(r.value.supervisorId).toBe('user-3');
    }
  });

  it('chuỗi rỗng -> null (dùng default), trừ tiêu đề', () => {
    const r = normalizeExecutionCreate(
      { title: 'Lượt sáng', executionDate: '', shift: '', createdBy: '' },
      'user-1',
      '2026-10-18',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe('Lượt sáng');
      expect(r.value.executionDate).toBe('2026-10-18');
      expect(r.value.shift).toBeNull();
      expect(r.value.createdBy).toBe('user-1');
    }
  });

  it('ngày sai định dạng -> INVALID_EXECUTION_DATE', () => {
    const r = normalizeExecutionCreate({ title: 'T', executionDate: '18/10/2026' }, 'user-1', '2026-10-18');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_EXECUTION_DATE');
  });

  it('giờ sai định dạng -> INVALID_EXECUTION_TIME', () => {
    for (const bad of ['8:30', '25:00', '08-30', '0830']) {
      const r = normalizeExecutionCreate({ title: 'T', executionTime: bad }, 'user-1', '2026-10-18');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_EXECUTION_TIME');
    }
  });

  it('ca sai -> INVALID_SHIFT; chữ thường vẫn nhận', () => {
    const bad = normalizeExecutionCreate({ title: 'T', shift: 'DEM' }, 'user-1', '2026-10-18');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('INVALID_SHIFT');
    const lower = normalizeExecutionCreate({ title: 'T', shift: 'chieu' }, 'user-1', '2026-10-18');
    expect(lower.ok).toBe(true);
    if (lower.ok) expect(lower.value.shift).toBe('CHIEU');
  });

  it('isValidShift nhận đúng 3 ca', () => {
    expect(isValidShift('SANG')).toBe(true);
    expect(isValidShift('CHIEU')).toBe(true);
    expect(isValidShift('TOI')).toBe(true);
    expect(isValidShift('DEM')).toBe(false);
    expect(isValidShift(null)).toBe(false);
    expect(isValidShift(undefined)).toBe(false);
  });
});

describe('D-14: checkStepAssignees', () => {
  it('đúng chức vụ cả 2 vai -> ok', () => {
    const r = checkStepAssignees(['pos-thu-kho'], ['pos-giam-sat'], ['pos-thu-kho'], ['pos-giam-sat']);
    expect(r).toEqual({ performerOk: true, supervisorOk: true });
  });

  it('sai chức vụ người thực hiện -> performerOk=false', () => {
    const r = checkStepAssignees(['pos-thu-kho'], ['pos-giam-sat'], ['pos-le-tan'], ['pos-giam-sat']);
    expect(r.performerOk).toBe(false);
    expect(r.supervisorOk).toBe(true);
  });

  it('sai chức vụ giám sát -> supervisorOk=false', () => {
    const r = checkStepAssignees(['pos-thu-kho'], ['pos-giam-sat'], ['pos-thu-kho'], ['pos-le-tan']);
    expect(r.performerOk).toBe(true);
    expect(r.supervisorOk).toBe(false);
  });

  it('không chọn giám sát -> supervisorOk=true', () => {
    const r = checkStepAssignees(['pos-thu-kho'], ['pos-giam-sat'], ['pos-thu-kho'], null);
    expect(r).toEqual({ performerOk: true, supervisorOk: true });
  });

  it('bước không định nghĩa chức vụ -> ai cũng được', () => {
    const r = checkStepAssignees([], [], [], null);
    expect(r).toEqual({ performerOk: true, supervisorOk: true });
  });
});
