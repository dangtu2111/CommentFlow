/**
 * Phần của form hồ sơ an toàn cho trình duyệt (không import gói server như `@flow/saas-core`, vốn kéo `pg` vào bundle client).
 * Phần đọc/kiểm form phía máy chủ nằm ở `profile-form.ts`.
 */

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
