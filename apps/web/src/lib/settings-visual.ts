/** Hàm thuần cho giao diện Cài đặt / Thành viên / Nhật ký (UI-FIDELITY nhóm 4). Không logic nghiệp vụ. */

/** Khớp `MIN_PASSWORD_LENGTH` của saas-core (chỉ để gợi ý; máy chủ mới là nơi quyết định). */
export const MIN_PASSWORD_LENGTH_HINT = 10;

export type PasswordChecks = {
  length: boolean;
  mixedCase: boolean;
  digit: boolean;
  special: boolean;
};

/** Danh sách kiểm gợi ý khi gõ mật khẩu mới. Chỉ để hiển thị; việc chấp nhận mật khẩu vẫn do máy chủ quyết. */
export function passwordChecks(
  password: string,
  minLength: number = MIN_PASSWORD_LENGTH_HINT,
): PasswordChecks {
  return {
    length: Array.from(password).length >= minLength,
    mixedCase: /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password),
    digit: /\d/.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password),
  };
}

/** Độ mạnh 0–4 = số mục đạt (thanh bốn đoạn). Mật khẩu rỗng → 0. */
export function passwordStrength(password: string, minLength?: number): 0 | 1 | 2 | 3 | 4 {
  if (password === '') return 0;
  const passed = Object.values(passwordChecks(password, minLength)).filter(Boolean).length;
  return passed as 0 | 1 | 2 | 3 | 4;
}

/** Bước hiện tại của trình hướng dẫn bật 2FA: 1 mật khẩu · 2 quét QR + nhập mã · 3 lưu mã dự phòng. */
export function enrollStep(input: { begun: boolean; confirmed: boolean }): 1 | 2 | 3 {
  if (input.confirmed) return 3;
  return input.begun ? 2 : 1;
}

export type ActivityTone = 'moderation' | 'reply' | 'team' | 'channel' | 'neutral';

/** Tông màu chip hành động trong Nhật ký, theo nhóm tiền tố của mã hành động. */
export function activityTone(action: string): ActivityTone {
  if (action === 'comment.reply_requested') return 'reply';
  if (/^comment\.(un)?hid/.test(action)) return 'moderation';
  if (action.startsWith('member.') || action.startsWith('invitation.')) return 'team';
  if (action.startsWith('channel.') || action.startsWith('shopify.')) return 'channel';
  return 'neutral';
}

/** Tông chip vai trò ở danh sách thành viên: chỉ Owner nổi bật. */
export function roleTone(role: string): 'owner' | 'neutral' {
  return role === 'owner' ? 'owner' : 'neutral';
}
