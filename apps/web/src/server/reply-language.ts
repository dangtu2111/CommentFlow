import { parseReplyLanguage, type ReplyLanguage } from '@flow/shared';
import { z } from 'zod';

/**
 * Logic "Đổi ngôn ngữ trả lời của kênh" (FR-120), tách khỏi Server Action để test với phụ thuộc được tiêm.
 * Quyền Owner do `requireAppUser` + RLS/trigger DB bảo đảm; ở đây chỉ kiểm đầu vào và ánh xạ kết quả. Kênh của
 * workspace khác (UPDATE 0 dòng) → `not_found`, không lộ tồn tại. Log chỉ có tên sự kiện/tên lỗi.
 */
export type ReplyLanguageFailure = 'not_found' | 'invalid_language' | 'unavailable';
export type ReplyLanguageResult = { ok: true } | { ok: false; reason: ReplyLanguageFailure };
export type ReplyLanguageSession = { workspaceId: string; userId: string };

export type ReplyLanguageDeps = {
  /** `true` nếu có kênh được cập nhật. */
  update: (
    session: ReplyLanguageSession,
    channelId: string,
    language: ReplyLanguage,
  ) => Promise<boolean>;
  warn: (event: { event: string; reason?: string }) => void;
};

export function createReplyLanguageAction(deps: ReplyLanguageDeps) {
  return async function replyLanguageAction(
    session: ReplyLanguageSession,
    channelId: unknown,
    language: unknown,
  ): Promise<ReplyLanguageResult> {
    if (!z.uuid().safeParse(channelId).success) return { ok: false, reason: 'not_found' };
    const parsed = parseReplyLanguage(language);
    if (!parsed) return { ok: false, reason: 'invalid_language' };
    try {
      const updated = await deps.update(session, channelId as string, parsed);
      return updated ? { ok: true } : { ok: false, reason: 'not_found' };
    } catch (error) {
      deps.warn({
        event: 'reply_language_failed',
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return { ok: false, reason: 'unavailable' };
    }
  };
}
