import {
  parseCassoPayload,
  parseSepayPayload,
  verifyCassoToken,
  verifySepayAuth,
} from '@flow/connectors';
import type { BankTransactionInput, ReconcileOutcome } from '@flow/saas-core';
import { MAX_WEBHOOK_BODY_BYTES, readCapped } from './meta-webhook';

/**
 * Cửa vào webhook xác nhận thanh toán tự động (FR-124): SePay và Casso. Không đăng nhập; xác thực bằng khóa bí mật của
 * nhà cung cấp (so sánh thời gian hằng). Cờ `BANK_WEBHOOK_ENABLED` MẶC ĐỊNH TẮT → 503 (đóng). Việc đối soát/ghi DB do
 * `reconcile` (xem `@flow/saas-core` `reconcileBankTransaction`); tầng này chỉ xác minh + parse + trả đúng định dạng
 * phản hồi mà nhà cung cấp chờ. Log chỉ chứa TÊN kết quả — không nội dung sao kê (có thể chứa tên người chuyển).
 */
export type BankWebhookDeps = {
  provider: 'sepay' | 'casso';
  enabled: () => boolean;
  /** Khóa bí mật của nhà cung cấp; `undefined`/rỗng = chưa cấu hình → 503. */
  secret: () => string | undefined;
  reconcile: (tx: BankTransactionInput) => Promise<ReconcileOutcome>;
  warn: (event: { event: string; reason?: string }) => void;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
const plain = (status: number): Response => new Response('', { status });

export function createBankWebhookHandler(deps: BankWebhookDeps) {
  const authorized = (req: Request, secret: string): boolean =>
    deps.provider === 'sepay'
      ? verifySepayAuth(req.headers.get('authorization'), secret)
      : verifyCassoToken(req.headers.get('secure-token'), secret);

  return async function handlePost(req: Request): Promise<Response> {
    if (!deps.enabled()) return plain(503);
    const secret = deps.secret();
    if (!secret) return plain(503);
    if (!authorized(req, secret)) return plain(401);

    const raw = await readCapped(req, MAX_WEBHOOK_BODY_BYTES);
    if (raw === 'too_large') return plain(413);
    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return plain(400);
    }

    const parsed = deps.provider === 'sepay' ? [parseSepayPayload(body)] : parseCassoPayload(body);
    let infraFailed = false;
    for (const tx of parsed) {
      if (!tx) {
        // Tiền ra hoặc payload sai dạng: bỏ qua nhưng để lại dấu vết (không nội dung) để xử lý tay.
        deps.warn({ event: 'bank_webhook_ignored', reason: 'not_incoming_or_schema' });
        continue;
      }
      try {
        const outcome = await deps.reconcile({
          bankRef: tx.bankRef,
          amountVnd: tx.amountVnd,
          content: tx.content,
          accountNumber: tx.accountNumber,
        });
        if (outcome !== 'confirmed') {
          deps.warn({ event: 'bank_webhook_unsettled', reason: outcome });
        }
      } catch (error) {
        deps.warn({
          event: 'bank_webhook_failed',
          reason: error instanceof Error ? error.name : 'unknown',
        });
        infraFailed = true;
      }
    }
    // Lỗi hạ tầng → 500: nhà cung cấp gửi lại; đối soát idempotent nên gửi lại an toàn.
    if (infraFailed) return plain(500);
    return deps.provider === 'sepay' ? json(200, { success: true }) : json(200, { error: 0 });
  };
}
