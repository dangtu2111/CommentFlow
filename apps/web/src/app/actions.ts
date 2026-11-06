'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { setLocaleCookie } from '../lib/locale-cookie';
import { getAuthRuntime } from '../server/auth';
import { applyLocaleChoice } from '../server/locale-choice';
import { getCurrentUser } from '../server/session';

/**
 * Lưu ngôn ngữ người dùng chọn: cookie (URL không có tiền tố /vi /en) và, nếu đã đăng nhập, `users.locale` (FR-119).
 * userId lấy từ phiên phía server, không nhận từ form.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const jar = await cookies();
  await applyLocaleChoice(formData.get('locale'), {
    setCookie: (locale) => setLocaleCookie(jar, locale),
    currentUserId: async () => (await getCurrentUser())?.id ?? null,
    saveLocale: (userId, locale) => getAuthRuntime().tenancy.setUserLocale(userId, locale),
  });
  revalidatePath('/', 'layout');
}
