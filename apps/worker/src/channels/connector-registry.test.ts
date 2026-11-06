import { describe, expect, it, vi } from 'vitest';
import { buildConnectorRegistry } from './connector-registry';

const KEYS = `v1:${'b'.repeat(64)}`;
const enabled = {
  enabled: true,
  appId: '123456789012345',
  appSecret: 'bi-mat-app-gia-0123456789abcdef',
} as const;
const off = { enabled: false } as const;
const base = { db: {} as never, logger: { warn: vi.fn() } };

describe('FR-016 buildConnectorRegistry (FB-CONNECTOR-REGISTER)', () => {
  it('cờ tắt → sổ RỖNG, không đụng DB/mạng/khóa', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const registry = buildConnectorRegistry({
      ...base,
      facebook: off,
      instagram: off,
      tokenEncKeys: undefined,
    });
    expect(registry.has('facebook')).toBe(false);
    expect(registry.has('instagram')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('cờ bật → có connector facebook (đọc được trả lời theo cha) và dựng không gọi mạng', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const registry = buildConnectorRegistry({
      ...base,
      facebook: enabled,
      instagram: off,
      tokenEncKeys: KEYS,
    });
    expect(registry.has('facebook')).toBe(true);
    expect(registry.has('instagram')).toBe(false);
    expect(registry.get('facebook').platform).toBe('facebook');
    expect(typeof registry.get('facebook').fetchReplies).toBe('function');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('FR-013 IG_CONNECTOR_ENABLED độc lập với FB: chỉ IG → chỉ có instagram; cả hai → cả hai', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onlyIg = buildConnectorRegistry({
      ...base,
      facebook: off,
      instagram: enabled,
      tokenEncKeys: KEYS,
    });
    expect(onlyIg.has('instagram')).toBe(true);
    expect(onlyIg.has('facebook')).toBe(false);
    expect(typeof onlyIg.get('instagram').fetchReplies).toBe('function');
    const both = buildConnectorRegistry({
      ...base,
      facebook: enabled,
      instagram: enabled,
      tokenEncKeys: KEYS,
    });
    expect(both.has('facebook') && both.has('instagram')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('cờ bật mà khóa mã hóa sai định dạng/thiếu → ném (không khởi động), không lộ khóa', () => {
    for (const keys of ['khoa-hong-bimat', undefined]) {
      for (const flags of [
        { facebook: enabled, instagram: off },
        { facebook: off, instagram: enabled },
      ]) {
        try {
          buildConnectorRegistry({ ...base, ...flags, tokenEncKeys: keys });
          expect.unreachable();
        } catch (error) {
          expect((error as Error).message).not.toContain('bimat');
        }
      }
    }
  });
});
