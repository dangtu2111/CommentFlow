import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_TURN_LIMIT,
  DEFAULT_USAGE_TIME_ZONE,
  resolveAiTurnLimit,
} from './ai-turn-limit';

describe('FR-090 resolveAiTurnLimit — hạn mức lượt AI tạm (chờ PLANS-SCHEMA), dùng chung web và worker', () => {
  it('thiếu biến → mặc định; múi giờ mặc định cố định', () => {
    expect(resolveAiTurnLimit({})).toBe(DEFAULT_AI_TURN_LIMIT);
    expect(DEFAULT_USAGE_TIME_ZONE).toBe('Asia/Ho_Chi_Minh');
  });

  it('số nguyên hợp lệ (kể cả 0) được dùng', () => {
    expect(resolveAiTurnLimit({ AI_TURNS_PLAN_LIMIT: '1200' })).toBe(1200);
    expect(resolveAiTurnLimit({ AI_TURNS_PLAN_LIMIT: '0' })).toBe(0);
  });

  it('rỗng, âm, thập phân, chữ, quá trần → mặc định', () => {
    for (const bad of ['', ' ', '-1', '1.5', 'abc', '1e3', '1000000001']) {
      expect(resolveAiTurnLimit({ AI_TURNS_PLAN_LIMIT: bad })).toBe(DEFAULT_AI_TURN_LIMIT);
    }
  });
});
