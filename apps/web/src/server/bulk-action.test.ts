import { describe, expect, it, vi } from 'vitest';
import { type BulkActionDeps, createBulkActions } from './bulk-action';
import type { HideActionResult } from './hide-action';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const session = {
  workspaceId: '44444444-4444-4444-8444-444444444444',
  userId: '55555555-5555-4555-8555-555555555555',
};

function setup(over: Partial<BulkActionDeps> = {}) {
  const skip = vi.fn(async (_s: unknown, ids: string[]) => ids);
  const relabel = vi.fn(async (_s: unknown, ids: string[], _label: string) => ids);
  const hide = vi.fn(async (): Promise<HideActionResult> => ({ ok: true, hideId: 'h1' }));
  const warn = vi.fn();
  const actions = createBulkActions({ skip, relabel, hide, warn, ...over });
  return { actions, skip, relabel, hide, warn };
}

describe('FR-045 Bỏ qua hàng loạt', () => {
  it('FR-045 đổi hết → done = số yêu cầu; id lẻ (workspace khác/không hợp lệ) không đổi → not_applicable, không lộ lý do khác', async () => {
    const { actions } = setup({ skip: async () => [A] });
    expect(await actions.skipMany(session, [A, B])).toEqual({
      ok: true,
      requested: 2,
      done: 1,
      reasons: { not_applicable: 1 },
    });
  });

  it('FR-045 đầu vào sai → từ chối ngay, không đụng DB', async () => {
    const { actions, skip } = setup();
    expect(await actions.skipMany(session, [])).toEqual({ ok: false, reason: 'invalid_input' });
    expect(await actions.skipMany(session, [A, 'x'])).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
    expect(skip).not.toHaveBeenCalled();
  });

  it('FR-045 DB lỗi → unavailable, log chỉ có tên lỗi', async () => {
    const { actions, warn } = setup({
      skip: async () => {
        throw new TypeError('chi tiết nhạy cảm');
      },
    });
    expect(await actions.skipMany(session, [A])).toEqual({ ok: false, reason: 'unavailable' });
    expect(warn).toHaveBeenCalledWith({ event: 'bulk_skip_failed', reason: 'TypeError' });
  });
});

describe('FR-045 Đổi nhãn hàng loạt', () => {
  it('FR-045 nhãn hợp lệ → gọi DB với nhãn đó', async () => {
    const { actions, relabel } = setup();
    const r = await actions.relabelMany(session, [A, B], 'complaint');
    expect(r).toEqual({ ok: true, requested: 2, done: 2, reasons: {} });
    expect(relabel).toHaveBeenCalledWith(session, [A, B], 'complaint');
  });

  it('FR-045 nhãn ngoài bộ chuẩn → invalid_label, không đụng DB', async () => {
    const { actions, relabel } = setup();
    expect(await actions.relabelMany(session, [A], 'hỏi giá')).toEqual({
      ok: false,
      reason: 'invalid_label',
    });
    expect(relabel).not.toHaveBeenCalled();
  });
});

describe('FR-045 Ẩn hàng loạt (US-010) — qua đường ẩn từng bình luận, có xác nhận', () => {
  it('FR-045 thiếu confirmed === true → confirm_required, KHÔNG ẩn cái nào', async () => {
    const { actions, hide } = setup();
    for (const bad of [false, undefined, 'true', 1, null]) {
      expect(await actions.hideMany(session, [A], bad)).toEqual({
        ok: false,
        reason: 'confirm_required',
      });
    }
    expect(hide).not.toHaveBeenCalled();
  });

  it('FR-045 mỗi bình luận gọi đường ẩn riêng với hide=true, đúng thứ tự', async () => {
    const { actions, hide } = setup();
    const r = await actions.hideMany(session, [A, B, C], true);
    expect(r).toEqual({ ok: true, requested: 3, done: 3, reasons: {} });
    expect(hide.mock.calls).toEqual([
      [session, A, true],
      [session, B, true],
      [session, C, true],
    ]);
  });

  it('FR-045 một cái bị từ chối không chặn cái khác; kết quả gom theo lý do; hideId null (đã ẩn) tính là xong', async () => {
    const results: HideActionResult[] = [
      { ok: false, reason: 'locked_by_other' },
      { ok: true, hideId: null },
      { ok: false, reason: 'locked_by_other' },
      { ok: false, reason: 'not_found' },
    ];
    const hide = vi.fn(async () => results.shift() as HideActionResult);
    const { actions } = setup({ hide });
    const four = [A, B, C, '66666666-6666-4666-8666-666666666666'];
    expect(await actions.hideMany(session, four, true)).toEqual({
      ok: true,
      requested: 4,
      done: 1,
      reasons: { locked_by_other: 2, not_found: 1 },
    });
    expect(hide).toHaveBeenCalledTimes(4);
  });

  it('FR-045 đầu vào sai kiểm TRƯỚC cổng xác nhận không cần thiết: id sai → invalid_input', async () => {
    const { actions, hide } = setup();
    expect(await actions.hideMany(session, ['x'], true)).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
    expect(hide).not.toHaveBeenCalled();
  });
});

describe('FR-045 không có đường gửi hàng loạt', () => {
  it('FR-045 bộ hành động chỉ có skipMany/relabelMany/hideMany (không có gửi trả lời)', () => {
    const { actions } = setup();
    expect(Object.keys(actions).sort()).toEqual(['hideMany', 'relabelMany', 'skipMany']);
  });
});
