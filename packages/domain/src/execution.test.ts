import { describe, expect, it } from 'vitest';
import { canTransition } from './execution.js';

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
