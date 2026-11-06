import { isValidTimeZone } from '@flow/saas-core';
import { z } from 'zod';

/** Giới hạn ký tự hiển thị ở bộ đếm "(n/50 ký tự)" của Stitch. */
export const PROFILE_NAME_MAX = 50;

export type ProfileErrors = { name?: 'required' | 'too_long'; timezone?: 'invalid' };

/** Kết quả của form "Chỉnh sửa thông tin" (đọc bằng `useActionState`). Không bao giờ chứa dữ liệu nhạy cảm. */
export type ProfileState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'invalid'; errors: ProfileErrors }
  | { status: 'error' };

export const PROFILE_IDLE: ProfileState = { status: 'idle' };

const profileSchema = z.object({
  name: z.string().trim().min(1, 'required').max(PROFILE_NAME_MAX, 'too_long'),
  timezone: z.string().refine(isValidTimeZone, 'invalid'),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * Chỉ đọc đúng hai trường `name`, `timezone` — email, SĐT, vai trò… do client gửi kèm đều bị bỏ qua (email chỉ đọc, SĐT chỉ
 * đổi qua xác minh OTP).
 */
export function parseProfileForm(
  data: FormData,
): { ok: true; value: ProfileInput } | { ok: false; errors: ProfileErrors } {
  const parsed = profileSchema.safeParse({
    name: typeof data.get('name') === 'string' ? data.get('name') : '',
    timezone: typeof data.get('timezone') === 'string' ? data.get('timezone') : '',
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: ProfileErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'name') errors.name = issue.message === 'too_long' ? 'too_long' : 'required';
    if (field === 'timezone') errors.timezone = 'invalid';
  }
  return { ok: false, errors };
}

/** `(GMT+07:00) Asia/Ho Chi Minh` — độ lệch lấy từ `Intl` nên đúng theo giờ hiện tại của vùng. */
export function timezoneLabel(zone: string): string {
  let offset = 'GMT';
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value;
    if (part) offset = part === 'GMT' ? 'GMT+00:00' : part;
  } catch {
    // Vùng lạ: giữ "GMT" trơn.
  }
  return `(${offset}) ${zone.replaceAll('_', ' ')}`;
}
