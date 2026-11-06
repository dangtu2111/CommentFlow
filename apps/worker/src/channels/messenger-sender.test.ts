import { describe, expect, it, vi } from 'vitest';
import { buildMessengerSender } from './messenger-sender';

const KEYS = `v1:${'b'.repeat(64)}`;
const base = { db: {} as never, logger: { warn: vi.fn() } };

describe('FR-014 buildMessengerSender (MESSENGER-WEBHOOK)', () => {
  it('cờ tắt → null, không đụng khóa/mạng', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(
      buildMessengerSender({ ...base, messenger: { enabled: false }, tokenEncKeys: undefined }),
    ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('cờ bật → bộ gửi có sendMessage; dựng không gọi mạng; thiếu khóa mã hóa → ném', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const messenger = { enabled: true, appId: '1', appSecret: 'bi-mat-app-gia' } as const;
    const sender = buildMessengerSender({ ...base, messenger, tokenEncKeys: KEYS });
    expect(typeof sender?.sendMessage).toBe('function');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() => buildMessengerSender({ ...base, messenger, tokenEncKeys: undefined })).toThrow();
    fetchSpy.mockRestore();
  });
});
