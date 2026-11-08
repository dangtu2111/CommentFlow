import { describe, expect, it } from 'vitest';
import { KB_SYNC_DEBOUNCE_SECONDS, kbSyncEnqueueOptions, kbSyncJobSchema } from './kb-sync';
import { isKbTopic, KB_TOPIC_CODES } from './kb-topics';

describe('kb-sync / kb-topics', () => {
  it('job chỉ nhận workspaceId hợp lệ', () => {
    expect(
      kbSyncJobSchema.safeParse({ workspaceId: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
    expect(kbSyncJobSchema.safeParse({ workspaceId: 'x' }).success).toBe(false);
  });
  it('tùy chọn xếp job: một lượt/workspace trong cửa sổ gộp', () => {
    expect(kbSyncEnqueueOptions('w')).toEqual({
      singletonKey: 'w',
      singletonSeconds: KB_SYNC_DEBOUNCE_SECONDS,
      startAfter: KB_SYNC_DEBOUNCE_SECONDS,
    });
  });
  it('isKbTopic chỉ nhận mã trong danh sách cố định', () => {
    for (const code of KB_TOPIC_CODES) expect(isKbTopic(code)).toBe(true);
    expect(isKbTopic('shipping')).toBe(false);
    expect(isKbTopic(3)).toBe(false);
  });
});
