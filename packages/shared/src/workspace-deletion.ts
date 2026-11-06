import { z } from 'zod';
import { AppError } from './errors';

/**
 * Xóa workspace nhiều bước (WORKSPACE-DELETE, FR-094, US-071, Q-WSD1): phần THUẦN, không chạm DB. Bảng thật là
 * `core.workspace_deletion_requests` (migration 0055); mọi thao tác ghi đi qua hàm DB (Owner: request/confirm/cancel;
 * worker: execute). Hằng số ở đây PHẢI khớp thân hàm SQL (test tích hợp kiểm).
 */

/** Thời gian chờ sau khi xác nhận bước 2 trước khi job xóa thật; trong thời gian này Owner hủy được. */
export const DELETION_GRACE_DAYS = 7;
/** Bước 2 phải làm trong khoảng này kể từ bước 1, quá hạn phải bắt đầu lại. */
export const DELETION_CONFIRM_WINDOW_MINUTES = 15;

export const DELETION_STATUSES = [
  'awaiting_confirm',
  'scheduled',
  'cancelled',
  'expired',
  'completed',
] as const;
export type DeletionStatus = (typeof DELETION_STATUSES)[number];

export type DeletionRequestInfo = {
  status: DeletionStatus;
  confirmExpiresAt: Date | null;
  executeAfter: Date | null;
};

/** `confirm_expired`: còn ghi `awaiting_confirm` nhưng hết cửa sổ; `due`: đã tới hạn, job được phép xóa. */
export type DeletionPhase =
  | 'awaiting_confirm'
  | 'confirm_expired'
  | 'scheduled'
  | 'due'
  | 'cancelled'
  | 'expired'
  | 'completed';

/** Bước 2: người dùng gõ lại đúng mã (slug) của workspace; bỏ khoảng trắng hai đầu, phân biệt hoa/thường. */
export function matchesDeletionConfirmation(slug: string, typed: string): boolean {
  const expected = slug.trim();
  return expected.length > 0 && typed.trim() === expected;
}

export function deletionExecuteAfter(confirmedAt: Date): Date {
  return new Date(confirmedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000);
}

/** Pha hiện tại của yêu cầu. `scheduled` thiếu `executeAfter` → không bao giờ `due` (fail-closed). */
export function deletionPhase(request: DeletionRequestInfo, now: Date): DeletionPhase {
  if (request.status === 'awaiting_confirm') {
    const expiresAt = request.confirmExpiresAt;
    return expiresAt && expiresAt.getTime() > now.getTime()
      ? 'awaiting_confirm'
      : 'confirm_expired';
  }
  if (request.status === 'scheduled') {
    const due = request.executeAfter && request.executeAfter.getTime() <= now.getTime();
    return due ? 'due' : 'scheduled';
  }
  return request.status;
}

const confirmDeletionSchema = z.object({
  requestId: z.string().uuid(),
  typedSlug: z.string().trim().min(1).max(100),
});
export type ConfirmDeletionInput = z.infer<typeof confirmDeletionSchema>;

export function parseConfirmDeletion(input: unknown): ConfirmDeletionInput {
  const parsed = confirmDeletionSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu xác nhận xóa workspace không hợp lệ.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
