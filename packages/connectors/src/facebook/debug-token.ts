import { grantedScopesForTarget } from '@flow/shared';
import { z } from 'zod';

/**
 * Phản hồi `GET /debug_token?input_token=…&access_token=<appId>|<appSecret>` (tài liệu Meta): nói token còn hiệu lực không, đã được CẤP những quyền nào
 * (khác với quyền ĐÃ XIN ở hộp thoại OAuth: người dùng có thể bỏ chọn) và quyền nào áp cho Page nào (`granular_scopes`). Không chứa token.
 */
export type FacebookTokenInfo = {
  valid: boolean;
  /** Quyền đã cấp (toàn token). */
  scopes: string[];
  /** Quyền kèm danh sách Page được cấp (nếu Meta trả). */
  granular: Array<{ scope: string; targetIds: string[] }>;
  /** Hết hạn token; `null` = không hết hạn. */
  expiresAt: Date | null;
};

export const debugTokenSchema = z.object({
  data: z.object({
    is_valid: z.boolean(),
    scopes: z.array(z.string()).optional(),
    granular_scopes: z
      .array(z.object({ scope: z.string(), target_ids: z.array(z.string()).optional() }))
      .optional(),
    expires_at: z.number().optional(),
  }),
});

/** `null` khi thân phản hồi sai hình dạng (nơi gọi ném `facebook_bad_response`). */
export function parseDebugToken(body: unknown): FacebookTokenInfo | null {
  const parsed = debugTokenSchema.safeParse(body);
  if (!parsed.success) return null;
  const { data } = parsed.data;
  return {
    valid: data.is_valid,
    scopes: [...new Set(data.scopes ?? [])].sort(),
    granular: (data.granular_scopes ?? []).map((entry) => ({
      scope: entry.scope,
      targetIds: entry.target_ids ?? [],
    })),
    // Meta trả 0 khi token không hết hạn.
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
  };
}

/** Quyền áp cho MỘT Page (xét `granular_scopes`). */
export function scopesForPage(info: FacebookTokenInfo, pageId: string): string[] {
  return grantedScopesForTarget(
    info.scopes,
    info.granular.map((entry) => ({ scope: entry.scope, target_ids: entry.targetIds })),
    pageId,
  ).sort();
}
