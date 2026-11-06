import { sendRecheck } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { type RecheckRow, recheckInputFromRow, settlementForRecheck } from './send';

const NOW = new Date('2026-11-06T03:00:00.000Z');
const clean: RecheckRow = {
  comment_status: 'sending',
  comment_external_reply_id: null,
  is_hidden: false,
  merged_into_id: null,
  deleted_at: null,
  channel_status: 'connected',
  channel_suspended: false,
};

function failed(row: RecheckRow) {
  const check = sendRecheck(recheckInputFromRow(row, NOW));
  if (check.ok) throw new Error('mong trượt');
  return check;
}

describe('FR-110 recheckInputFromRow — đường người gửi (outbox comment_replies)', () => {
  it('FR-042 chế độ human + bình luận; R4–R9 chưa có dữ liệu (null) → dòng sạch qua hết', () => {
    const input = recheckInputFromRow(clean, NOW);
    expect(input).toEqual({
      mode: 'human',
      target: 'comment',
      now: NOW,
      comment: {
        status: 'sending',
        externalReplyId: null,
        isHidden: false,
        mergedIntoId: null,
        deletedAt: null,
      },
      channel: { status: 'connected', sendSuspended: false },
      automation: null,
      price: null,
      kb: null,
      quota: null,
      message: null,
      rate: null,
    });
    expect(sendRecheck(input).ok).toBe(true);
  });

  it('R1: đã có external_reply_id hoặc không còn sending → recheck:R1, hủy, KHÔNG đụng bình luận', () => {
    for (const row of [
      { ...clean, comment_external_reply_id: 'r-1' },
      { ...clean, comment_status: 'replied' },
    ]) {
      const check = failed(row);
      expect(check.rule).toBe('recheck:R1');
      expect(settlementForRecheck(check, 'new')).toEqual({
        status: 'cancelled',
        commentStatus: null,
      });
    }
  });

  it('R2: ẩn / gộp / khách xóa → recheck:R2, hủy, trả bình luận về trạng thái trước', () => {
    for (const row of [
      { ...clean, is_hidden: true },
      { ...clean, merged_into_id: 'c-2' },
      { ...clean, deleted_at: new Date('2026-11-05T00:00:00Z') },
    ]) {
      const check = failed(row);
      expect(check.rule).toBe('recheck:R2');
      expect(settlementForRecheck(check, 'pending_review')).toEqual({
        status: 'cancelled',
        commentStatus: 'pending_review',
      });
    }
  });

  it('R3: kênh không connected hoặc tạm khóa gửi → recheck:R3, failed, bình luận send_failed', () => {
    for (const row of [
      { ...clean, channel_status: 'expired' },
      { ...clean, channel_suspended: true },
    ]) {
      const check = failed(row);
      expect(check.rule).toBe('recheck:R3');
      expect(settlementForRecheck(check, 'new')).toEqual({
        status: 'failed',
        commentStatus: 'send_failed',
      });
    }
  });

  it('R9: có bộ đếm tốc độ và hết lượt → recheck:R9 action defer (nơi gọi hoãn job, không ghi kết quả)', () => {
    const check = sendRecheck(recheckInputFromRow(clean, NOW, { remaining: 0 }));
    expect(check).toMatchObject({ ok: false, rule: 'recheck:R9', action: 'defer' });
    expect(sendRecheck(recheckInputFromRow(clean, NOW, { remaining: 2 })).ok).toBe(true);
  });

  it('đầu vào hỏng (rule input) và các điều kiện cần xác nhận/duyệt → failed + send_failed để nhân viên thấy lý do', () => {
    const unreadable = sendRecheck(null);
    if (unreadable.ok) throw new Error('mong trượt');
    expect(settlementForRecheck(unreadable, 'new')).toEqual({
      status: 'failed',
      commentStatus: 'send_failed',
    });
    for (const action of ['hold_review', 'ask_confirm'] as const) {
      expect(
        settlementForRecheck(
          { ok: false, rule: 'recheck:R5', reason: 'price_changed', action, rulesPassed: 4 },
          'new',
        ),
      ).toEqual({ status: 'failed', commentStatus: 'send_failed' });
    }
  });
});
