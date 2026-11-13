import { AppError } from '@flow/shared';
import { createLlmClient, type LlmClientOptions } from '../llm-client';
import { loadCaptionConfig } from './caption-config';
import { type Captioner, createLlmCaptioner } from './captioner';

/**
 * Dựng bộ soạn caption/hashtag THẬT cho web (POST-PUBLISHING). Giống `createLlmDepsFromEnv`: nối LLM qua LiteLLM; env chỉ có ĐỊA CHỈ (`LITELLM_BASE_URL`), khóa ảo (`LITELLM_API_KEY`)
 * và TÊN MODEL (`CAPTION_LLM_MODEL`, bắt buộc, không mặc định); BẬT/TẮT là cờ DB `cf.ai.caption` theo workspace (đọc ở MỖI lần dùng). Thiếu cấu hình → không có bản giả: `diagnose`
 * báo đúng nguyên nhân và `captioner` không tồn tại.
 */
export type CaptionNotReady = 'missing_service' | 'missing_model' | 'flag_off';

export type CaptionDeps = {
  captioner?: Captioner;
  /** Vì sao workspace này CHƯA dùng được (`null` = dùng được). Thứ tự: thiếu dịch vụ → thiếu model → cờ tắt. */
  diagnose: (workspaceId: string) => Promise<CaptionNotReady | null>;
};

export type CaptionDepsOptions = {
  env: Record<string, string | undefined>;
  db: Pick<LlmClientOptions['db'], 'withWorkspace'>;
  isEnabled: (workspaceId: string) => Promise<boolean>;
  onMisconfigured?: (message: string) => void;
  fetchImpl?: typeof fetch;
};

export function createCaptionDepsFromEnv(options: CaptionDepsOptions): CaptionDeps {
  const baseUrl = options.env.LITELLM_BASE_URL?.trim();
  const apiKey = options.env.LITELLM_API_KEY?.trim();
  const { model } = loadCaptionConfig(options.env);
  let warned = false;
  const warnOnce = (why: string) => {
    if (warned) return;
    warned = true;
    options.onMisconfigured?.(
      `Cờ cf.ai.caption đang bật nhưng ${why}: bước này KHÔNG chạy (không dùng model mặc định).`,
    );
  };

  const diagnose = async (workspaceId: string): Promise<CaptionNotReady | null> => {
    const enabled = await options.isEnabled(workspaceId);
    if (!baseUrl || !apiKey) {
      if (enabled) warnOnce('thiếu LITELLM_BASE_URL/LITELLM_API_KEY');
      return 'missing_service';
    }
    if (!model) {
      if (enabled) warnOnce('thiếu CAPTION_LLM_MODEL');
      return 'missing_model';
    }
    return enabled ? null : 'flag_off';
  };

  if (!baseUrl || !apiKey || !model) return { diagnose };

  const llm = createLlmClient({
    db: options.db as LlmClientOptions['db'],
    baseUrl,
    apiKey,
    fetchImpl: options.fetchImpl,
    // Chỉ siêu dữ liệu an toàn (bước, mã HTTP), không bao giờ nội dung.
    logger: { warn: (fields, message) => console.error(JSON.stringify({ message, ...fields })) },
  });
  const base = createLlmCaptioner({ llm, model });
  const gate = async (workspaceId: string): Promise<void> => {
    if (!(await options.isEnabled(workspaceId))) {
      throw new AppError('LLM_UNAVAILABLE', 'Bước AI "caption" đang tắt (cờ cf.ai.caption).');
    }
  };
  return {
    diagnose,
    captioner: {
      suggestCaption: async (input) => {
        await gate(input.workspaceId);
        return base.suggestCaption(input);
      },
      suggestHashtags: async (input) => {
        await gate(input.workspaceId);
        return base.suggestHashtags(input);
      },
    },
  };
}
