import type { MemberRole, MemberStatus } from '@flow/saas-core';

/** Khóa trong `members.errors.*` (vi.json / en.json). Giao diện chỉ thấy khóa, không thấy mã lỗi thô. */
export type MembersMessageKey =
  | 'emailInvalid'
  | 'roleInvalid'
  | 'rateLimited'
  | 'lastOwner'
  | 'invalid'
  | 'generic';

export type MembersFormState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'sent' }
  | { status: 'error'; message: MembersMessageKey; retryMinutes?: number; email?: string };

export const MEMBERS_IDLE: MembersFormState = { status: 'idle' };

/** Việc Owner làm với một thành viên (một biểu mẫu, nhiều nút). */
export const MEMBER_INTENTS = ['make-owner', 'make-staff', 'suspend', 'restore', 'remove'] as const;
export type MemberIntent = (typeof MEMBER_INTENTS)[number];

export type MemberChange =
  | { kind: 'role'; role: MemberRole }
  | { kind: 'status'; status: MemberStatus };

const CHANGES: Record<MemberIntent, MemberChange> = {
  'make-owner': { kind: 'role', role: 'owner' },
  'make-staff': { kind: 'role', role: 'staff' },
  suspend: { kind: 'status', status: 'suspended' },
  restore: { kind: 'status', status: 'active' },
  remove: { kind: 'status', status: 'removed' },
};

const isIntent = (value: unknown): value is MemberIntent =>
  typeof value === 'string' && (MEMBER_INTENTS as readonly string[]).includes(value);

/** Đổi `intent` từ form thành thay đổi cụ thể; giá trị lạ → null (không đoán). */
export function changeForIntent(intent: unknown): MemberChange | null {
  return isIntent(intent) ? CHANGES[intent] : null;
}

export type ParsedInvite =
  | { ok: true; email: string; role: MemberRole }
  | { ok: false; message: 'emailInvalid' | 'roleInvalid'; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kiểm đầu vào lời mời ở web (saas-core kiểm lại bằng Zod): email hợp lệ, vai trò chỉ owner/staff. */
export function parseInviteForm(input: { email: unknown; role: unknown }): ParsedInvite {
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (email.length > 254 || !EMAIL.test(email))
    return { ok: false, message: 'emailInvalid', email };
  if (input.role !== 'owner' && input.role !== 'staff') {
    return { ok: false, message: 'roleInvalid', email };
  }
  return { ok: true, email, role: input.role };
}

/** Làm tròn lên số phút chờ để hiển thị ("thử lại sau N phút"). */
export const retryMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));
