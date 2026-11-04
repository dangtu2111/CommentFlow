import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenConfigError } from './token-cipher';
import { assertTokenKeysCoverVersions } from './token-startup-check';

const hex = () => randomBytes(32).toString('hex');

describe('FR-010 kiểm tra khóa lúc khởi động', () => {
  it('FR-010 chưa có kênh nào và chưa đặt khóa → qua (chưa cần khóa)', () => {
    expect(() =>
      assertTokenKeysCoverVersions({ rawKeys: undefined, versionsInUse: [] }),
    ).not.toThrow();
    expect(() => assertTokenKeysCoverVersions({ rawKeys: '', versionsInUse: [] })).not.toThrow();
  });

  it('FR-010 đủ khóa cho mọi phiên bản đang dùng → qua (khóa thừa cũng được)', () => {
    const raw = `v1:${hex()},v2:${hex()},v3:${hex()}`;
    expect(() =>
      assertTokenKeysCoverVersions({ rawKeys: raw, versionsInUse: [1, 2] }),
    ).not.toThrow();
  });

  it('FR-010 thiếu khóa cho phiên bản đang dùng → TokenConfigError nêu các phiên bản thiếu, KHÔNG in khóa', () => {
    const k1 = hex();
    try {
      assertTokenKeysCoverVersions({ rawKeys: `v1:${k1}`, versionsInUse: [3, 1, 2] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TokenConfigError);
      const message = (error as Error).message;
      expect(message).toContain('v2');
      expect(message).toContain('v3');
      expect(message).not.toContain('v1');
      expect(message).not.toContain(k1);
    }
  });

  it('FR-010 có kênh dùng khóa nhưng TOKEN_ENC_KEYS trống/sai định dạng → TokenConfigError', () => {
    expect(() => assertTokenKeysCoverVersions({ rawKeys: undefined, versionsInUse: [1] })).toThrow(
      TokenConfigError,
    );
    expect(() => assertTokenKeysCoverVersions({ rawKeys: 'rac', versionsInUse: [1] })).toThrow(
      TokenConfigError,
    );
  });

  it('FR-010 khóa sai định dạng bị báo ngay cả khi chưa có kênh nào', () => {
    expect(() => assertTokenKeysCoverVersions({ rawKeys: 'rac', versionsInUse: [] })).toThrow(
      TokenConfigError,
    );
  });
});
