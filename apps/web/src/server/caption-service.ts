import type { Captioner, CaptionNotReady } from '@flow/ai';

export type CaptionKind = 'caption' | 'hashtags';
export type CaptionFailure =
  | 'empty_input'
  | 'empty'
  | 'unsupported_claims'
  | 'flag_off'
  | 'not_configured'
  | 'rate_limited'
  | 'unavailable';
export type SuggestionResult =
  | { ok: true; kind: 'caption'; text: string }
  | { ok: true; kind: 'hashtags'; hashtags: string[] }
  | { ok: false; reason: CaptionFailure };

export type CaptionServiceDeps = {
  /** Vì sao workspace CHƯA dùng được AI soạn caption (`null` = dùng được). */
  diagnose: (workspaceId: string) => Promise<CaptionNotReady | null>;
  /** Bộ soạn thật; `undefined` khi thiếu cấu hình (không có bản giả). */
  captioner: () => Captioner | undefined;
  warn: (event: { event: string; reason: string }) => void;
};

const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'unknown';

/**
 * Dịch vụ gợi ý AI cho Biên tập bài viết (POST-PUBLISHING). Điều phối: kiểm sẵn sàng (cờ DB + cấu hình) → gọi bộ soạn → dịch kết quả/lỗi thành mã dễ hiểu. AI chỉ GỢI Ý văn bản, người dùng tự
 * quyết định dùng. Không bao giờ log nội dung ý tưởng hay caption; chỉ MÃ lỗi. Workspace luôn từ phiên của người gọi, không từ form.
 */
export function createCaptionService(deps: CaptionServiceDeps) {
  return {
    async suggest(
      workspaceId: string,
      kind: CaptionKind,
      draft: string,
    ): Promise<SuggestionResult> {
      const notReady = await deps.diagnose(workspaceId);
      if (notReady === 'flag_off') return { ok: false, reason: 'flag_off' };
      if (notReady !== null) return { ok: false, reason: 'not_configured' };
      const captioner = deps.captioner();
      if (!captioner) return { ok: false, reason: 'not_configured' };
      try {
        if (kind === 'caption') {
          const r = await captioner.suggestCaption({ workspaceId, draft });
          return r.ok ? { ok: true, kind, text: r.text } : { ok: false, reason: r.reason };
        }
        const r = await captioner.suggestHashtags({ workspaceId, draft });
        return r.ok ? { ok: true, kind, hashtags: r.hashtags } : { ok: false, reason: r.reason };
      } catch (error) {
        const code = codeOf(error);
        if (code === 'LLM_UNAVAILABLE') return { ok: false, reason: 'flag_off' };
        deps.warn({ event: 'caption_failed', reason: code });
        return { ok: false, reason: 'unavailable' };
      }
    },
  };
}
