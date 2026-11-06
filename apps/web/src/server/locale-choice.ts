import { isLocale, type Locale } from '@flow/shared';

export type LocaleChoiceDeps = {
  setCookie: (locale: Locale) => void;
  /** Id người dùng của phiên hiện tại; null nếu chưa đăng nhập. */
  currentUserId: () => Promise<string | null>;
  saveLocale: (userId: string, locale: Locale) => Promise<void>;
};

/**
 * Áp dụng lựa chọn ngôn ngữ (FR-119): luôn đặt cookie `NEXT_LOCALE` (giao diện đổi ngay); nếu đã đăng nhập thì lưu
 * thêm vào `users.locale` để email và máy khác dùng đúng ngôn ngữ. Lưu DB lỗi KHÔNG làm hỏng việc đổi giao diện:
 * chỉ ghi log (tên lỗi + mã Postgres, không message thô).
 */
export async function applyLocaleChoice(value: unknown, deps: LocaleChoiceDeps): Promise<void> {
  if (!isLocale(value)) return;
  deps.setCookie(value);
  const userId = await deps.currentUserId();
  if (!userId) return;
  try {
    await deps.saveLocale(userId, value);
  } catch (error) {
    const e = error as { name?: string; code?: string; cause?: { code?: string } };
    console.error(
      JSON.stringify({
        event: 'locale_save_failed',
        error: e?.name ?? 'unknown',
        pgCode: e?.cause?.code ?? e?.code ?? null,
      }),
    );
  }
}
