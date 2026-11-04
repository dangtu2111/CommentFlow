import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { DECLARED_CAPABILITIES } from './declarations';
import { createConnectorRegistry } from './registry';
import { createFakeConnector } from './testing';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return isAppError(error) ? error.code : 'KHÁC';
  }
  return undefined;
};

describe('FR-016 registry connector', () => {
  it('FR-016 đăng ký và lấy connector theo nền tảng; liệt kê nền tảng đã đăng ký', () => {
    const fb = createFakeConnector('facebook');
    const registry = createConnectorRegistry([fb]);
    expect(registry.get('facebook')).toBe(fb);
    expect(registry.has('facebook')).toBe(true);
    expect(registry.has('tiktok')).toBe(false);
    expect(registry.platforms()).toEqual(['facebook']);
  });

  it('FR-016 trùng nền tảng → CONFLICT; chưa đăng ký → NOT_FOUND', () => {
    expect(
      codeOf(() =>
        createConnectorRegistry([createFakeConnector('facebook'), createFakeConnector('facebook')]),
      ),
    ).toBe('CONFLICT');
    expect(codeOf(() => createConnectorRegistry([]).get('tiktok'))).toBe('NOT_FOUND');
  });

  it('FR-016 capabilitiesOf đọc khai báo của connector đã đăng ký, hoặc khai báo mặc định khi chưa có connector (UI vẫn biết ẩn nút Ẩn của TikTok)', () => {
    const registry = createConnectorRegistry([]);
    expect(registry.capabilitiesOf('tiktok')).toBe(DECLARED_CAPABILITIES.tiktok);
    expect(registry.capabilitiesOf('tiktok').hide.supported).toBe(false);
    const custom = createFakeConnector('instagram');
    expect(createConnectorRegistry([custom]).capabilitiesOf('instagram')).toBe(custom.capabilities);
  });
});
