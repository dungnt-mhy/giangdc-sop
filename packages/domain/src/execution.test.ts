import { describe, expect, it } from 'vitest';
import { allRequiredStepsDone, assigneeMatchesPositions, canStepTransition, canTransition, generateExecutionCode, photoRequired } from './execution.js';

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
    const states = ['CREATED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED'] as const;
    for (const s of states) {
      expect(canTransition('CANCELLED', s)).toBe(false);
    }
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
