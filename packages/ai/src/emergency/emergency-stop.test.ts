import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decideEmergencyChange,
  type EmergencyState,
  type EmergencyStopRole,
  initialEmergencyState,
  isEmergencyStopped,
  stateFromStoppedAt,
} from './emergency-stop';

const NOW = new Date('2026-11-06T10:00:00Z');
const running = initialEmergencyState('ws-a');
const stopped: EmergencyState = {
  workspaceId: 'ws-a',
  stoppedAt: new Date('2026-11-06T09:00:00Z'),
  stoppedBy: 'u-staff',
};

describe('FR-073 decideEmergencyChange — Dừng', () => {
  it.each(['owner', 'staff'] as const)('%s được Dừng', (role) => {
    const r = decideEmergencyChange(running, { action: 'stop', role, userId: 'u1' }, NOW);
    expect(r).toMatchObject({ ok: true, state: { stoppedAt: NOW, stoppedBy: 'u1' } });
    expect(r.ok && isEmergencyStopped(r.state)).toBe(true);
  });

  it.each(['viewer', '', 'admin', undefined, null])('vai trò %s → forbidden', (role) => {
    const r = decideEmergencyChange(
      running,
      { action: 'stop', role: role as unknown as EmergencyStopRole, userId: 'u1' },
      NOW,
    );
    expect(r).toEqual({ ok: false, code: 'forbidden' });
  });

  it('Dừng lần hai không đổi giờ/người dừng đầu tiên', () => {
    const r = decideEmergencyChange(stopped, { action: 'stop', role: 'owner', userId: 'u9' }, NOW);
    expect(r).toEqual({ ok: false, code: 'already_stopped' });
  });

  it('thiếu userId → invalid_input', () => {
    const r = decideEmergencyChange(running, { action: 'stop', role: 'owner', userId: ' ' }, NOW);
    expect(r).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('FR-073 decideEmergencyChange — Bật lại', () => {
  it('Owner Bật lại được', () => {
    const r = decideEmergencyChange(
      stopped,
      { action: 'resume', role: 'owner', userId: 'u1' },
      NOW,
    );
    expect(r.ok && isEmergencyStopped(r.state)).toBe(false);
  });

  it('Staff không Bật lại được, kể cả khi đang chạy', () => {
    const a = decideEmergencyChange(
      stopped,
      { action: 'resume', role: 'staff', userId: 'u1' },
      NOW,
    );
    const b = decideEmergencyChange(
      running,
      { action: 'resume', role: 'staff', userId: 'u1' },
      NOW,
    );
    expect(a).toEqual({ ok: false, code: 'forbidden' });
    expect(b).toEqual({ ok: false, code: 'forbidden' });
  });

  it('Bật lại khi chưa dừng → not_stopped', () => {
    const r = decideEmergencyChange(
      running,
      { action: 'resume', role: 'owner', userId: 'u1' },
      NOW,
    );
    expect(r).toEqual({ ok: false, code: 'not_stopped' });
  });

  it('hành động lạ → invalid_input, không ném', () => {
    const r = decideEmergencyChange(
      stopped,
      { action: 'boom' as never, role: 'owner', userId: 'u1' },
      NOW,
    );
    expect(r).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('stateFromStoppedAt (cột workspaces.emergency_stopped_at)', () => {
  it('null → chạy; Date → dừng; giá trị hỏng → coi là DỪNG (thiên về an toàn)', () => {
    expect(isEmergencyStopped(stateFromStoppedAt('w', null))).toBe(false);
    expect(isEmergencyStopped(stateFromStoppedAt('w', new Date(1)))).toBe(true);
    expect(isEmergencyStopped(stateFromStoppedAt('w', new Date('x')))).toBe(true);
  });
});

describe('FR-073 property: Dừng/Bật lại ngẫu nhiên', () => {
  const step = fc.record({
    action: fc.constantFrom('stop' as const, 'resume' as const),
    role: fc.constantFrom('owner' as const, 'staff' as const, 'viewer' as never),
  });
  it('chỉ Owner đưa workspace từ dừng sang chạy; trạng thái = lần đổi hợp lệ cuối', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        let state = running;
        let expected = false;
        steps.forEach((s, i) => {
          const before = isEmergencyStopped(state);
          const r = decideEmergencyChange(state, { ...s, userId: `u${i}` }, NOW);
          if (r.ok) {
            state = r.state;
            expected = s.action === 'stop';
            if (before && !isEmergencyStopped(state)) expect(s.role).toBe('owner');
          }
          expect(isEmergencyStopped(state)).toBe(expected);
        });
      }),
    );
  });
});
