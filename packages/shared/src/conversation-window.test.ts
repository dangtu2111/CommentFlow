import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_AUTO_WINDOW_MS,
  CONVERSATION_HUMAN_WINDOW_MS,
  conversationWindow,
} from './conversation-window';

const T0 = new Date('2026-01-10T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('FR-047 cửa sổ hội thoại 24 giờ / 7 ngày', () => {
  it('trong 24 giờ: open, còn hạn tự động', () => {
    const w = conversationWindow(T0, at(1000));
    expect(w.state).toBe('open');
    expect(w.autoUntil).toEqual(at(CONVERSATION_AUTO_WINDOW_MS));
    expect(w.humanUntil).toEqual(at(CONVERSATION_HUMAN_WINDOW_MS));
    expect(w.msUntilNextState).toBe(CONVERSATION_AUTO_WINDOW_MS - 1000);
  });
  it('đúng 24 giờ vẫn open (khớp evaluateAction: elapsed <= withinMs); +1ms là human_only', () => {
    expect(conversationWindow(T0, at(CONVERSATION_AUTO_WINDOW_MS)).state).toBe('open');
    expect(conversationWindow(T0, at(CONVERSATION_AUTO_WINDOW_MS + 1)).state).toBe('human_only');
  });
  it('đúng 7 ngày vẫn human_only; +1ms là closed, msUntilNextState = 0', () => {
    expect(conversationWindow(T0, at(CONVERSATION_HUMAN_WINDOW_MS)).state).toBe('human_only');
    const c = conversationWindow(T0, at(CONVERSATION_HUMAN_WINDOW_MS + 1));
    expect(c.state).toBe('closed');
    expect(c.msUntilNextState).toBe(0);
  });
  it('chưa có tin khách (null) hoặc mốc ở tương lai: closed / open an toàn', () => {
    expect(conversationWindow(null, T0).state).toBe('closed');
    expect(conversationWindow(at(5000), T0).state).toBe('open');
  });
});
