import { describe, expect, it, vi } from 'vitest';
import { applyLocaleChoice } from './locale-choice';

function deps(over: Partial<Parameters<typeof applyLocaleChoice>[1]> = {}) {
  return {
    setCookie: vi.fn(),
    currentUserId: vi.fn(async () => 'u1' as string | null),
    saveLocale: vi.fn(async () => undefined),
    ...over,
  };
}

describe('FR-119 applyLocaleChoice', () => {
  it('giá trị không hợp lệ: không làm gì', async () => {
    const d = deps();
    await applyLocaleChoice('fr', d);
    await applyLocaleChoice(null, d);
    expect(d.setCookie).not.toHaveBeenCalled();
    expect(d.saveLocale).not.toHaveBeenCalled();
  });

  it('có phiên: đặt cookie và lưu users.locale', async () => {
    const d = deps();
    await applyLocaleChoice('en', d);
    expect(d.setCookie).toHaveBeenCalledWith('en');
    expect(d.saveLocale).toHaveBeenCalledWith('u1', 'en');
  });

  it('chưa đăng nhập: chỉ đặt cookie, không gọi DB', async () => {
    const d = deps({ currentUserId: vi.fn(async () => null) });
    await applyLocaleChoice('vi', d);
    expect(d.setCookie).toHaveBeenCalledWith('vi');
    expect(d.saveLocale).not.toHaveBeenCalled();
  });

  it('lưu DB lỗi: cookie vẫn đặt, không ném lỗi, log không chứa dữ liệu thô', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({
      saveLocale: vi.fn(async () => {
        throw new Error('secret@example.com 0901234567');
      }),
    });
    await expect(applyLocaleChoice('en', d)).resolves.toBeUndefined();
    expect(d.setCookie).toHaveBeenCalledWith('en');
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('locale_save_failed');
    expect(line).not.toContain('secret@example.com');
    log.mockRestore();
  });
});
