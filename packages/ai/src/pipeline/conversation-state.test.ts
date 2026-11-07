import { describe, expect, it } from 'vitest';
import { FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import {
  carryOverAsks,
  EMPTY_CONVERSATION_STATE,
  nextConversationState,
  parseConversationState,
} from './conversation-state';

const P = '11111111-1111-4111-8111-111111111111';

describe('trạng thái hội thoại có cấu trúc', () => {
  it('hỏi lại → ghi sản phẩm + ý đang chờ; trả lời/chuyển hướng/chuyển người → hết ý chờ', () => {
    expect(nextConversationState({ action: 'clarify', productIds: [P, P], asks: ['giá'] })).toEqual(
      {
        productIds: [P],
        pendingAsks: ['giá'],
      },
    );
    for (const action of ['answer', 'redirect', 'handoff'] as const) {
      expect(nextConversationState({ action, productIds: [P], asks: ['giá'] }).pendingAsks).toEqual(
        [],
      );
    }
  });

  it('đọc lại từ jsonb: hợp lệ → giữ; hỏng/thiếu → null', () => {
    const s = { productIds: [P], pendingAsks: ['giá'] };
    expect(parseConversationState(s)).toEqual(s);
    expect(parseConversationState({ productIds: ['x'], pendingAsks: [] })).toBeNull();
    expect(parseConversationState(null)).toBeNull();
    expect(parseConversationState(EMPTY_CONVERSATION_STATE)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it('khách trả lời ngắn (không có ý hỏi) → thừa hưởng ý đang chờ; có ý hỏi mới hoặc không có ý chờ → giữ nguyên', () => {
    const short = { ...FIXTURE_EXTRACT_DEFAULT, asks: [] as string[], size: 'M', color: 'đen' };
    const state = { productIds: [P], pendingAsks: ['giá'] };
    expect(carryOverAsks(short, state).asks).toEqual(['giá']);
    expect(carryOverAsks({ ...short, asks: ['ship'] }, state).asks).toEqual(['ship']);
    expect(carryOverAsks(short, null)).toBe(short);
    expect(carryOverAsks(short, { productIds: [P], pendingAsks: [] })).toBe(short);
  });
});
