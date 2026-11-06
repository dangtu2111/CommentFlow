/**
 * Khôi phục 2FA khi mất cả điện thoại lẫn mã dự phòng (FR-001, QRCV1).
 * Mọi phụ thuộc ngoài (kho, thư, kiểm toán, người dùng) đi qua interface dưới đây.
 */

export type RecoveryStatus =
  | 'awaiting_email'
  | 'waiting'
  | 'completed'
  | 'cancelled'
  | 'superseded';

export type RecoveryRequest = {
  id: string;
  userId: string;
  /** HMAC của token xác minh/hoàn tất — KHÔNG lưu token thô. */
  verifyHash: string;
  /** HMAC của token hủy (gửi trong email báo). Chỉ có sau khi xác minh email. */
  cancelHash: string | null;
  status: RecoveryStatus;
  createdAt: number;
  /** Hạn bấm link xác minh email. */
  verifyExpiresAt: number;
  /** Mốc có thể hoàn tất (sau khi xác minh email + thời gian chờ). */
  releaseAt: number | null;
  approvedBy: string | null;
  approvedAt: number | null;
  completedAt: number | null;
};

/** Pha suy ra từ trạng thái + thời gian (hàm thuần `recoveryPhase`). */
export type RecoveryPhase =
  | 'awaiting_email'
  | 'waiting'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'superseded'
  | 'expired';

export type RecoveryPatch = Partial<Omit<RecoveryRequest, 'id' | 'userId'>>;

export type RecoveryStore = {
  insert(request: RecoveryRequest): Promise<void>;
  findById(id: string): Promise<RecoveryRequest | null>;
  findByVerifyHash(hash: string): Promise<RecoveryRequest | null>;
  findByCancelHash(hash: string): Promise<RecoveryRequest | null>;
  /** Yêu cầu chưa kết thúc của người dùng (`awaiting_email` hoặc `waiting`). */
  findOpenByUser(userId: string): Promise<RecoveryRequest | null>;
  /** So-sánh-rồi-đặt nguyên tử: chỉ áp `patch` nếu trạng thái hiện tại là `from`. Trả true khi áp được. */
  transition(id: string, from: RecoveryStatus, patch: RecoveryPatch): Promise<boolean>;
};

export type RecoveryAuditEvent =
  | 'requested'
  | 'email_verified'
  | 'approved'
  | 'cancelled'
  | 'completed'
  | 'superseded'
  | 'wrong_password'
  | 'complete_failed';

/** Kiểm toán: KHÔNG email, token, IP. `actorId` là người duyệt (nếu có). */
export type RecoveryAuditEntry = {
  event: RecoveryAuditEvent;
  userId: string | null;
  requestId: string | null;
  actorId?: string;
  at: number;
};

export type RecoveryAudit = { record(entry: RecoveryAuditEntry): Promise<void> };

export type RecoveryMailer = {
  sendVerify(input: { to: string; token: string; expiresAt: number }): Promise<void>;
  /** Báo cho chủ tài khoản: có yêu cầu đặt lại 2FA, kèm link hủy. */
  sendCancelNotice(input: {
    to: string;
    cancelToken: string;
    releaseAt: number | null;
  }): Promise<void>;
  sendCompleted(input: { to: string }): Promise<void>;
};

export type RecoveryUser = { id: string; email: string; twoFactorEnabled: boolean };

export type RecoveryUsers = {
  findByEmail(email: string): Promise<RecoveryUser | null>;
  findById(id: string): Promise<RecoveryUser | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
};

export type RecoveryEffects = {
  verifyPassword(userId: string, password: string): Promise<boolean>;
  /** Xóa hàng 2FA của người dùng và đặt cờ bật = false. */
  disableTwoFactor(userId: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<number>;
};
