'use server';

import { isLocale, LOCALE_COOKIE } from '@flow/shared';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/** Lưu ngôn ngữ người dùng chọn vào cookie (URL không có tiền tố /vi /en). */
export async function setLocale(formData: FormData): Promise<void> {
  const value = formData.get('locale');
  if (!isLocale(value)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}
