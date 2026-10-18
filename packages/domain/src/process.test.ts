import { describe, expect, it } from 'vitest';
import {
  canVersionTransition,
  isEditableState,
  isVoided,
  nextVersionNo,
  validateVersionForSubmit,
  checkVersionApproval,
  resolveActivation,
  blankStep,
  type ProcessVersionState,
  type VersionDraft,
  type StepDraft,
} from './process.js';

const ALL: ProcessVersionState[] = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'ACTIVE',
  'SUPERSEDED',
  'RETIRED',
];

function draft(over: Partial<VersionDraft> = {}): VersionDraft {
  return {
    changeSummary: 'Cập nhật bước kiểm tra',
    changeSize: 'MINOR',
    impactAssessment: null,
    effectiveFrom: null,
    ...over,
  };
}

function step(over: Partial<StepDraft> = {}): StepDraft {
  return {
    code: 'B01',
    title: 'Nhận giấy giới thiệu',
    prerequisites: null,
    inputs: null,
    instructions: null,
    expectedResult: null,
    outputs: null,
    notes: null,
    performerPositionIds: [],
    supervisorPositionIds: [],
    required: true,
    targetDurationMin: null,
    warnings: null,
    completion: [],
    skip: { allowed: false, allowedPositions: [], reasonRequired: true, approvalLevel: null },
    failurePolicy: 'STOP',
    ...over,
  };
}

describe('ProcessVersion state machine (SRS v1.6 §7.1, §7.5)', () => {
  it('DRAFT -> IN_REVIEW (submit)', () => {
    expect(canVersionTransition('DRAFT', 'IN_REVIEW')).toBe(true);
  });

  it('IN_REVIEW -> DRAFT (return) giữ lịch sử', () => {
    expect(canVersionTransition('IN_REVIEW', 'DRAFT')).toBe(true);
  });

  it('IN_REVIEW -> APPROVED (approve)', () => {
    expect(canVersionTransition('IN_REVIEW', 'APPROVED')).toBe(true);
  });

  it('APPROVED -> ACTIVE (release ngay)', () => {
    expect(canVersionTransition('APPROVED', 'ACTIVE')).toBe(true);
  });

  it('APPROVED -> SCHEDULED (release theo lịch)', () => {
    expect(canVersionTransition('APPROVED', 'SCHEDULED')).toBe(true);
  });

  it('SCHEDULED -> ACTIVE (đến hạn kích hoạt)', () => {
    expect(canVersionTransition('SCHEDULED', 'ACTIVE')).toBe(true);
  });

  it('ACTIVE -> SUPERSEDED (bản mới thay thế)', () => {
    expect(canVersionTransition('ACTIVE', 'SUPERSEDED')).toBe(true);
  });

  it('SUPERSEDED -> RETIRED (ngừng dùng)', () => {
    expect(canVersionTransition('SUPERSEDED', 'RETIRED')).toBe(true);
  });

  it('DRAFT không nhảy thẳng lên APPROVED/ACTIVE', () => {
    expect(canVersionTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canVersionTransition('DRAFT', 'ACTIVE')).toBe(false);
  });

  it('ACTIVE không về lại DRAFT/IN_REVIEW', () => {
    expect(canVersionTransition('ACTIVE', 'DRAFT')).toBe(false);
    expect(canVersionTransition('ACTIVE', 'IN_REVIEW')).toBe(false);
  });

  it('D-20: APPROVED -> DRAFT (Hủy phê duyệt)', () => {
    expect(canVersionTransition('APPROVED', 'DRAFT')).toBe(true);
  });

  it('D-20: ACTIVE -> RETIRED (Ngừng)', () => {
    expect(canVersionTransition('ACTIVE', 'RETIRED')).toBe(true);
  });

  it('D-20: SUPERSEDED/RETIRED -> IN_REVIEW (Kích hoạt lại, qua duyệt lại)', () => {
    expect(canVersionTransition('SUPERSEDED', 'IN_REVIEW')).toBe(true);
    expect(canVersionTransition('RETIRED', 'IN_REVIEW')).toBe(true);
  });

  it('D-20b: isVoided — "Đã hủy" là cờ voided_at, không phải state', () => {
    expect(isVoided(null)).toBe(false);
    expect(isVoided(undefined)).toBe(false);
    expect(isVoided({})).toBe(false);
    expect(isVoided({ voidedAt: null })).toBe(false);
    expect(isVoided({ voidedAt: '2026-10-18T12:00:00.000Z' })).toBe(true);
  });

  it('SUPERSEDED không quay lại ACTIVE', () => {
    expect(canVersionTransition('SUPERSEDED', 'ACTIVE')).toBe(false);
  });
});

describe('Khóa sửa từ IN_REVIEW (GOV-001, AC-02)', () => {
  it('chỉ DRAFT được sửa', () => {
    expect(isEditableState('DRAFT')).toBe(true);
    for (const s of ALL.filter((x) => x !== 'DRAFT')) {
      expect(isEditableState(s)).toBe(false);
    }
  });
});

describe('Đánh số phiên bản (BR-001)', () => {
  it('version đầu = 1, tiếp theo tăng dần', () => {
    expect(nextVersionNo([])).toBe(1);
    expect(nextVersionNo([1])).toBe(2);
    expect(nextVersionNo([1, 2, 3])).toBe(4);
  });
});

describe('Kích hoạt: 1 ACTIVE + 1 SCHEDULED (SRS §7.1, AC-02)', () => {
  const v = (state: ProcessVersionState, id = 'v1') => ({ id, state });

  it('kích hoạt bản APPROVED khi chưa có ACTIVE -> ok', () => {
    const r = resolveActivation([v('RETIRED', 'v0'), v('APPROVED', 'v1')], 'v1');
    expect(r.ok).toBe(true);
  });

  it('kích hoạt bản mới khi đã có ACTIVE -> supersede nguyên tử bản cũ', () => {
    const r = resolveActivation([v('ACTIVE', 'v1'), v('APPROVED', 'v2')], 'v2');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.supersede).toEqual(['v1']);
  });

  it('từ chối khi đã có SCHEDULED chưa kích hoạt (AC-02)', () => {
    const r = resolveActivation([v('SCHEDULED', 'v9'), v('APPROVED', 'v10')], 'v10');
    expect(r.ok).toBe(false);
  });

  it('retry activation idempotent: bản đã ACTIVE thì không tạo gì thêm', () => {
    const r = resolveActivation([v('ACTIVE', 'v2')], 'v2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.supersede).toEqual([]);
      expect(r.alreadyActive).toBe(true);
    }
  });
});

describe('BR-003: change_summary bắt buộc, thay đổi lớn cần đánh giá tác động', () => {
  it('thiếu change_summary -> lỗi', () => {
    const issues = validateVersionForSubmit(draft({ changeSummary: '' }), [step()]);
    expect(issues.some((i) => i.code === 'CHANGE_SUMMARY_REQUIRED')).toBe(true);
  });

  it('MAJOR thiếu impactAssessment -> lỗi', () => {
    const issues = validateVersionForSubmit(
      draft({ changeSize: 'MAJOR', impactAssessment: null }),
      [step()],
    );
    expect(issues.some((i) => i.code === 'IMPACT_ASSESSMENT_REQUIRED')).toBe(true);
  });

  it('MINOR đủ change_summary -> không lỗi BR-003', () => {
    const issues = validateVersionForSubmit(draft(), [step()]);
    expect(issues.some((i) => i.code.startsWith('CHANGE') || i.code.startsWith('IMPACT'))).toBe(false);
  });
});

describe('PRC-009: validate bản nháp trả lỗi theo bước/trường', () => {
  it('bước thiếu tiêu đề -> lỗi trỏ đúng step + field', () => {
    const issues = validateVersionForSubmit(draft(), [step({ title: '' })]);
    const hit = issues.find((i) => i.code === 'STEP_TITLE_REQUIRED');
    expect(hit).toBeDefined();
    expect(hit?.field).toBe('title');
  });

  it('bước thiếu mã -> lỗi', () => {
    const issues = validateVersionForSubmit(draft(), [step({ code: '  ' })]);
    expect(issues.some((i) => i.code === 'STEP_CODE_REQUIRED')).toBe(true);
  });

  it('bản nháp không có bước nào -> lỗi', () => {
    const issues = validateVersionForSubmit(draft(), []);
    expect(issues.some((i) => i.code === 'VERSION_EMPTY')).toBe(true);
  });

  it('skip cho phép nhưng không khai báo chức vụ được bỏ qua -> cảnh báo lỗi', () => {
    const issues = validateVersionForSubmit(
      draft(),
      [step({ skip: { allowed: true, allowedPositions: [], reasonRequired: true, approvalLevel: null } })],
    );
    expect(issues.some((i) => i.code === 'SKIP_POSITIONS_REQUIRED')).toBe(true);
  });

  it('bản nháp hợp lệ -> không có lỗi', () => {
    expect(validateVersionForSubmit(draft(), [step(), step({ code: 'B02', title: 'Bước 2' })])).toEqual([]);
  });
});

describe('Phê duyệt phiên bản (GOV-004 + D-10 + D-08)', () => {
  const P = (...ps: string[]) => new Set<string>(ps);
  it('người có process.approve được phê duyệt LOW', () => {
    const r = checkVersionApproval({
      requesterId: 'u-author',
      candidateId: 'u-pheduyet',
      candidatePermissions: P('process.view', 'process.approve'),
      candidateSenior: false,
      severity: 'LOW',
    });
    expect(r.ok).toBe(true);
  });

  it('không được tự chọn mình (4 mắt mặc định)', () => {
    const r = checkVersionApproval({
      requesterId: 'u1',
      candidateId: 'u1',
      candidatePermissions: P('process.approve'),
      candidateSenior: false,
      severity: 'LOW',
    });
    expect(r.ok).toBe(false);
  });

  it('D-08/D-10: HIGH yêu cầu cờ senior cho phê duyệt phiên bản', () => {
    const bad = checkVersionApproval({
      requesterId: 'u-author',
      candidateId: 'u-pheduyet',
      candidatePermissions: P('process.approve'),
      candidateSenior: false,
      severity: 'HIGH',
    });
    expect(bad.ok).toBe(false);
    const good = checkVersionApproval({
      requesterId: 'u-author',
      candidateId: 'u-quanly',
      candidatePermissions: P('process.approve'),
      candidateSenior: true,
      severity: 'HIGH',
    });
    expect(good.ok).toBe(true);
  });

  it('vai trò senior tự phê duyệt được nhưng bị gắn cờ (D-10)', () => {
    const r = checkVersionApproval({
      requesterId: 'u-admin',
      candidateId: 'u-admin',
      candidatePermissions: P('process.approve', 'user.manage'),
      candidateSenior: true,
      severity: 'MEDIUM',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.selfApproved).toBe(true);
      expect(r.flagged).toBe(true);
    }
  });

  it('vai trò không senior không được tự phê duyệt', () => {
    const r = checkVersionApproval({
      requesterId: 'u-pheduyet',
      candidateId: 'u-pheduyet',
      candidatePermissions: P('process.approve'),
      candidateSenior: false,
      severity: 'LOW',
    });
    expect(r.ok).toBe(false);
  });
});

describe('blankStep: 12 trường PRC-005 có đủ', () => {
  it('tạo bước trống với mọi trường', () => {
    const s = blankStep();
    for (const f of [
      'code', 'title', 'prerequisites', 'inputs', 'instructions', 'expectedResult',
      'outputs', 'notes', 'performerPositionIds', 'supervisorPositionIds',
      'required', 'targetDurationMin', 'warnings',
    ] as const) {
      expect(s).toHaveProperty(f);
    }
    expect(s.completion).toEqual([]);
    expect(s.failurePolicy).toBe('STOP');
  });
});

describe('validate performerPositionIds[] / supervisorPositionIds[] (D-09, 17/10/2026)', () => {
  it('chấp nhận mảng id chức vụ hợp lệ', () => {
    const issues = validateVersionForSubmit(
      draft(),
      [step({ performerPositionIds: ['pos-thu-kho', 'pos-thu-quy'], supervisorPositionIds: ['pos-giam-sat'] })],
    );
    expect(issues.filter((i) => i.field === 'performerPositionIds' || i.field === 'supervisorPositionIds')).toEqual([]);
  });
  it('báo lỗi khi có id rỗng', () => {
    const issues = validateVersionForSubmit(draft(), [step({ performerPositionIds: ['pos-thu-kho', '  '] })]);
    expect(issues.some((i) => i.code === 'POSITION_ID_EMPTY' && i.field === 'performerPositionIds')).toBe(true);
  });
  it('báo lỗi khi quá 20 chức vụ', () => {
    const issues = validateVersionForSubmit(
      draft(),
      [step({ supervisorPositionIds: Array.from({ length: 21 }, (_, i) => `pos-${i}`) })],
    );
    expect(issues.some((i) => i.code === 'POSITION_IDS_TOO_MANY' && i.field === 'supervisorPositionIds')).toBe(true);
  });
  it('báo lỗi khi không phải mảng', () => {
    const issues = validateVersionForSubmit(
      draft(),
      [step({ performerPositionIds: 'pos-thu-kho' as unknown as string[] })],
    );
    expect(issues.some((i) => i.code === 'POSITION_IDS_NOT_ARRAY' && i.field === 'performerPositionIds')).toBe(true);
  });
});
