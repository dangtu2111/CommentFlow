import { isValidTimeZone } from '@flow/saas-core';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@flow/shared';

/** Khóa trong `workspace.errors.*` (vi.json / en.json). Giao diện chỉ thấy khóa, không thấy mã lỗi thô. */
export type WorkspaceMessageKey = 'nameInvalid' | 'timezoneInvalid' | 'generic';

export type WorkspaceFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      message: WorkspaceMessageKey;
      values: { name: string; timezone: string; defaultLang: Locale };
    };

export const WORKSPACE_IDLE: WorkspaceFormState = { status: 'idle' };

export type ParsedWorkspaceForm =
  | { ok: true; name: string; timezone: string; defaultLang: Locale }
  | {
      ok: false;
      message: WorkspaceMessageKey;
      values: { name: string; timezone: string; defaultLang: Locale };
    };

const MAX_NAME = 80;

/** Kiểm đầu vào form tạo workspace (không tin client: múi giờ/ngôn ngữ phải nằm trong danh sách cho phép). */
export function parseWorkspaceForm(input: {
  name: unknown;
  timezone: unknown;
  defaultLang: unknown;
}): ParsedWorkspaceForm {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const timezone = typeof input.timezone === 'string' ? input.timezone : '';
  const defaultLang: Locale = isLocale(input.defaultLang) ? input.defaultLang : DEFAULT_LOCALE;
  const values = { name, timezone, defaultLang };
  if (name.length < 1 || name.length > MAX_NAME)
    return { ok: false, message: 'nameInvalid', values };
  if (!isValidTimeZone(timezone)) return { ok: false, message: 'timezoneInvalid', values };
  return { ok: true, name, timezone, defaultLang };
}
