import type { Locale } from '@flow/shared';

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
