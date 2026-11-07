import type { RateAction, RateLimiter } from '@flow/saas-core';
import { getAuthRuntime } from './auth';

/**
 * Chống BẤM ĐÚP và spam thao tác giao diện (Server Action của người đã đăng nhập), dùng bộ giới hạn tốc độ sẵn có (Valkey,
 * dự phòng bộ nhớ khi kho lỗi — xem `RATE_POLICIES`):
 *  - `uiWrite`     : sửa/thêm/xóa nội dung, ngôn ngữ trả lời — tối đa 1 lần/giây và 30 lần/phút cho mỗi người dùng;
 *  - `uiSensitive` : nhập thông tin xác thực nền tảng, ngắt kết nối — 1 lần/2 giây, 10 lần/10 phút;
 *  - `uiHeavy`     : thao tác NẶNG qua worker (đồng bộ Shopify, kiểm tra kết nối) — 1 lần/3 giây, 1 lần/30 giây cho mỗi workspace.
 * Danh tính lấy từ phiên (không từ form). `false` = chặn; nơi gọi chuyển hướng kèm thông báo `rate_limited`.
 */
export type GuardedAction = Extract<RateAction, 'uiWrite' | 'uiSensitive' | 'uiHeavy'>;
export type GuardIdentity = { userId: string; workspaceId: string };

export function createActionGuard(limiter: Pick<RateLimiter, 'check'>) {
  return async (action: GuardedAction, who: GuardIdentity): Promise<boolean> =>
    (await limiter.check(action, who)).allowed;
}

/** Bản dùng bộ giới hạn thật của ứng dụng. */
export function actionAllowed(action: GuardedAction, who: GuardIdentity): Promise<boolean> {
  return createActionGuard(getAuthRuntime().limiter)(action, who);
}
