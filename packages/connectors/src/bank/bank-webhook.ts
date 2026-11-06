import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Webhook dịch vụ đọc giao dịch ngân hàng (FR-124): SePay và Casso. CHỈ xác minh khóa + chuẩn hóa payload thành
 * `BankTransaction`; không chạm DB, không gọi dịch vụ ngoài. Hình dạng payload/tiêu đề theo tài liệu công khai của hai
 * nhà cung cấp (xem docs/can-ban-cung-cap.d/ap-fr124.md: cần đối chiếu lại khi có tài khoản thật).
 *
 * Nội dung sao kê (`content`) có thể chứa tên người chuyển → KHÔNG log, KHÔNG gửi LLM (nguyên tắc #6).
 */
export type BankTransaction = {
  provider: 'sepay' | 'casso';
  /** Mã giao dịch duy nhất toàn hệ thống: `SEPAY:<id>` / `CASSO:<id>` (một giao dịch không tính hai lần). */
  bankRef: string;
  amountVnd: number;
  content: string;
  accountNumber: string | null;
};

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** SePay gửi `Authorization: Apikey <khóa>`. Khóa cấu hình rỗng → luôn từ chối. */
export function verifySepayAuth(header: string | null, apiKey: string): boolean {
  if (!apiKey || !header) return false;
  const prefix = 'Apikey ';
  if (!header.startsWith(prefix)) return false;
  return constantTimeEqual(header.slice(prefix.length), apiKey);
}

/** Casso gửi khóa bí mật ở tiêu đề `secure-token`. Khóa cấu hình rỗng → luôn từ chối. */
export function verifyCassoToken(header: string | null, token: string): boolean {
  if (!token || !header) return false;
  return constantTimeEqual(header, token);
}

const amountSchema = z.number().int().min(1).max(1_000_000_000);

const sepaySchema = z.object({
  id: z.union([z.number().int().safe(), z.string().min(1).max(60)]),
  transferType: z.literal('in'),
  transferAmount: amountSchema,
  content: z.string().max(2000).nullish(),
  accountNumber: z.string().max(40).nullish(),
});

/** Một giao dịch SePay; `null` nếu không phải tiền vào hợp lệ (bỏ qua, không phải lỗi). */
export function parseSepayPayload(body: unknown): BankTransaction | null {
  const parsed = sepaySchema.safeParse(body);
  if (!parsed.success) return null;
  const v = parsed.data;
  return {
    provider: 'sepay',
    bankRef: `SEPAY:${v.id}`,
    amountVnd: v.transferAmount,
    content: v.content ?? '',
    accountNumber: v.accountNumber ?? null,
  };
}

const cassoRowSchema = z.object({
  id: z.union([z.number().int().safe(), z.string().min(1).max(60)]),
  amount: amountSchema,
  description: z.string().max(2000).nullish(),
  bank_sub_acc_id: z.string().max(40).nullish(),
});

/** Các giao dịch tiền vào trong một lô Casso; dòng hỏng/tiền ra bị bỏ. */
export function parseCassoPayload(body: unknown): BankTransaction[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: BankTransaction[] = [];
  for (const row of data) {
    const parsed = cassoRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const v = parsed.data;
    out.push({
      provider: 'casso',
      bankRef: `CASSO:${v.id}`,
      amountVnd: v.amount,
      content: v.description ?? '',
      accountNumber: v.bank_sub_acc_id ?? null,
    });
  }
  return out;
}
