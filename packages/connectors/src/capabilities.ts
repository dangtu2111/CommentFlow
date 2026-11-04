import { z } from 'zod';

/**
 * Khai báo khả năng của một connector (FR-016, docs/12 §9): hành động nào được phép, cửa sổ thời gian, giới hạn ký tự.
 * Phần xử lý (cổng gửi, kiểm lại trước khi gửi, giao diện) ĐỌC khai báo này thay vì viết cứng luật từng nền tảng.
 */
export const ACTIONS = ['reply', 'hide', 'unhide', 'privateReply', 'sendMessage'] as const;
export type ActionName = (typeof ACTIONS)[number];

/** Một cửa sổ: trong `withinMs` kể từ mốc tham chiếu; `humanOnly` = chỉ người bấm gửi (không tự động). */
const windowSchema = z.object({
  withinMs: z.number().int().positive(),
  humanOnly: z.boolean(),
});

export const actionCapabilitySchema = z.discriminatedUnion('supported', [
  z.object({
    supported: z.literal(false),
    /** `true` = đã đối chiếu tài liệu chính thức; `false` = theo ghi nhận trong spec "cần kiểm". */
    verified: z.boolean(),
    note: z.string().optional(),
  }),
  z.object({
    supported: z.literal(true),
    verified: z.boolean(),
    note: z.string().optional(),
    /** Độ dài tối đa (theo ký tự/điểm mã, xem `textLengthOf`). */
    maxTextLength: z.number().int().positive().optional(),
    /** Các cửa sổ, xếp theo `withinMs` tăng dần; không khai báo = không giới hạn thời gian. */
    windows: z
      .array(windowSchema)
      .min(1)
      .refine(
        (w) =>
          w.every((x, i) => i === 0 || (w[i - 1] as { withinMs: number }).withinMs < x.withinMs),
        {
          message: 'windows phải tăng dần theo withinMs',
        },
      )
      .optional(),
    /** Chỉ được dùng một lần cho mỗi đối tượng (ví dụ nhắn riêng từ một bình luận). */
    oncePerTarget: z.boolean().optional(),
  }),
]);
export type ActionCapability = z.infer<typeof actionCapabilitySchema>;

export const connectorCapabilitiesSchema = z.object({
  reply: actionCapabilitySchema,
  hide: actionCapabilitySchema,
  unhide: actionCapabilitySchema,
  privateReply: actionCapabilitySchema,
  sendMessage: actionCapabilitySchema,
});
export type ConnectorCapabilities = z.infer<typeof connectorCapabilitiesSchema>;

export type ActionDenial =
  | 'ACTION_UNSUPPORTED'
  | 'ALREADY_USED'
  | 'WINDOW_EXPIRED'
  | 'HUMAN_REQUIRED'
  | 'TEXT_REQUIRED'
  | 'TEXT_TOO_LONG';

export type ActionDecision =
  | { allowed: true /** Cửa sổ đang áp dụng chỉ cho người gửi. */; humanOnly: boolean }
  | { allowed: false; reason: ActionDenial };

export type ActionContext = {
  /** Mốc bắt đầu cửa sổ: lúc bình luận được tạo, hoặc tin nhắn cuối của khách. */
  referenceAt: Date;
  /** Giờ hiện tại do nơi gọi truyền vào (không đọc đồng hồ ở đây — test bằng giờ giả). */
  now: Date;
  /** Người bấm gửi (true) hay hệ thống/AI tự gửi (false). */
  byHuman: boolean;
  /** Hành động `oncePerTarget` đã dùng cho đối tượng này chưa. */
  alreadyUsed?: boolean;
  /** Độ dài nội dung (xem `textLengthOf`); cần khi hành động có `maxTextLength`. */
  textLength?: number;
};

/** Độ dài theo ký tự (điểm mã Unicode): emoji và chữ có dấu tiếng Việt tính 1, không theo đơn vị UTF-16. */
export const textLengthOf = (text: string): number => [...text].length;

/**
 * Quyết định một hành động có được phép theo khai báo. Hàm THUẦN, thứ tự kiểm cố định:
 * không hỗ trợ → đã dùng một lần → quá cửa sổ → cửa sổ chỉ-người → độ dài. Không chắc (thiếu/sai độ dài) → từ chối.
 */
export function evaluateAction(
  capabilities: ConnectorCapabilities,
  action: ActionName,
  ctx: ActionContext,
): ActionDecision {
  const capability = capabilities[action];
  if (!capability.supported) return { allowed: false, reason: 'ACTION_UNSUPPORTED' };
  if (capability.oncePerTarget && ctx.alreadyUsed)
    return { allowed: false, reason: 'ALREADY_USED' };

  let humanOnly = false;
  if (capability.windows) {
    // Mốc ở tương lai (đồng hồ lệch) coi như 0.
    const elapsed = Math.max(0, ctx.now.getTime() - ctx.referenceAt.getTime());
    const window = capability.windows.find((w) => elapsed <= w.withinMs);
    if (!window) return { allowed: false, reason: 'WINDOW_EXPIRED' };
    if (window.humanOnly && !ctx.byHuman) return { allowed: false, reason: 'HUMAN_REQUIRED' };
    humanOnly = window.humanOnly;
  }

  if (capability.maxTextLength !== undefined) {
    const length = ctx.textLength;
    if (length === undefined || !Number.isInteger(length) || length < 0) {
      return { allowed: false, reason: 'TEXT_REQUIRED' };
    }
    if (length > capability.maxTextLength) return { allowed: false, reason: 'TEXT_TOO_LONG' };
  }
  return { allowed: true, humanOnly };
}
