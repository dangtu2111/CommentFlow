'use server';

import { isLocale } from '@flow/shared';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { setLocaleCookie } from '../lib/locale-cookie';

/** Lưu ngôn ngữ người dùng chọn vào cookie (URL không có tiền tố /vi /en). */
export async function setLocale(formData: FormData): Promise<void> {
  const value = formData.get('locale');
  if (!isLocale(value)) return;
  setLocaleCookie(await cookies(), value);
  revalidatePath('/', 'layout');
}
