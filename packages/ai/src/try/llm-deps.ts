import { AppError } from '@flow/shared';
import { loadClassifyConfig } from '../classify/classify-config';
import { createLlmExtractor, type Extractor } from '../classify/extractor';
import { loadDraftConfig } from '../draft/draft-config';
import { createLlmDrafter, type Drafter } from '../draft/drafter';
import { createLlmClient, type LlmClientOptions } from '../llm-client';
import { loadRewriteConfig } from '../rewrite/rewrite-config';
import { createLlmRewriter, type Rewriter } from '../rewrite/rewriter';

/**
 * DÙNG CHUNG cho ô Thử AI (web) và job `pipeline` (worker) — một nơi dựng LLM (PIPE-ORCHESTRATOR lát E).
 * Nối LLM THẬT qua LiteLLM; env chỉ còn ĐỊA CHỈ dịch vụ (`LITELLM_BASE_URL`), khóa ảo (`LITELLM_API_KEY`) và TÊN MODEL từng bước
 * (`CLASSIFY_LLM_MODEL`/`DRAFT_LLM_MODEL`/`REWRITE_LLM_MODEL`, bắt buộc, không mặc định). BẬT/TẮT từng bước là feature flag DB
 * (`cf.ai.classify|draft|rewrite`, theo workspace, docs/09 §10) — đọc qua `isStepEnabled` ở MỖI lần dùng nên đổi cờ có hiệu lực ngay (NOTIFY),
 * không cần khởi động lại. Thiếu URL/khóa/model → bước đó không có (không bao giờ gọi mạng thiếu cấu hình, không bản mẫu). Mọi lần gọi đi qua
 * `createLlmClient`: ghi `ai_usage` (nguyên tắc #7), chỉ nhận văn bản đã che PII (#6); hạn mức tiền do khóa ảo của LiteLLM chặn.
 * AI chỉ soạn câu — hành động, độ tin cậy, guard tiền, cổng tự gửi vẫn do code quyết (#3, #4, #9).
 */
export type LlmStep = 'classify' | 'draft' | 'rewrite';

export type LlmDeps = {
  extractor?: Extractor;
  drafter?: Drafter;
  rewriter?: Rewriter;
  /**
   * Workspace này có thể chạy AI không: extractor + drafter đã cấu hình (URL, khóa, model) VÀ cờ `cf.ai.classify` + `cf.ai.draft` đang bật cho workspace.
   * Nơi dùng (Thử AI, worker) gọi trước khi tốn lượt; false → "chưa cấu hình AI".
   */
  ready?: (workspaceId: string) => Promise<boolean>;
};

type Env = Record<string, string | undefined>;

export type LlmDepsOptions = {
  env: Env;
  /** Chỉ cần `withWorkspace` (ghi `ai_usage`); truyền bản lazy để không dựng DB khi chưa dùng. */
  db: Pick<LlmClientOptions['db'], 'withWorkspace'>;
  /** Cờ DB theo workspace (`createFlags(...).isEnabled`); đọc lỗi → dùng mặc định trong mã = TẮT. */
  isStepEnabled: (step: LlmStep, workspaceId: string) => Promise<boolean>;
  /** Cờ bật nhưng thiếu cấu hình (URL/khóa/model): gọi tối đa MỘT lần mỗi bước và mỗi tiến trình, để ghi log lỗi rõ. */
  onMisconfigured?: (message: string) => void;
  fetchImpl?: typeof fetch;
};

function disabled(step: LlmStep): AppError {
  return new AppError('LLM_UNAVAILABLE', `Bước AI "${step}" đang tắt (cờ cf.ai.${step}).`);
}

export function createLlmDepsFromEnv(options: LlmDepsOptions): LlmDeps {
  const baseUrl = options.env.LITELLM_BASE_URL?.trim();
  const apiKey = options.env.LITELLM_API_KEY?.trim();
  const models: Record<LlmStep, string | null> = {
    classify: loadClassifyConfig(options.env).model,
    draft: loadDraftConfig(options.env).model,
    rewrite: loadRewriteConfig(options.env).model,
  };
  const warned = new Set<LlmStep>();
  const warnOnce = (step: LlmStep, why: string) => {
    if (warned.has(step)) return;
    warned.add(step);
    options.onMisconfigured?.(
      `Cờ cf.ai.${step} đang bật nhưng ${why}: bước này KHÔNG chạy (không dùng model mặc định).`,
    );
  };

  if (!baseUrl || !apiKey) {
    return {
      ready: async (workspaceId) => {
        for (const step of ['classify', 'draft'] as const) {
          if (await options.isStepEnabled(step, workspaceId))
            warnOnce(step, 'thiếu LITELLM_BASE_URL/LITELLM_API_KEY');
        }
        return false;
      },
    };
  }

  const llm = createLlmClient({
    db: options.db as LlmClientOptions['db'],
    baseUrl,
    apiKey,
    fetchImpl: options.fetchImpl,
    // Chỉ siêu dữ liệu an toàn (bước, mã HTTP), không bao giờ nội dung.
    logger: { warn: (fields, message) => console.error(JSON.stringify({ message, ...fields })) },
  });
  const gate = async (step: LlmStep, workspaceId: string): Promise<void> => {
    if (!(await options.isStepEnabled(step, workspaceId))) throw disabled(step);
  };
  const extractorBase = models.classify
    ? createLlmExtractor({ llm, model: models.classify })
    : undefined;
  const drafterBase = models.draft ? createLlmDrafter({ llm, model: models.draft }) : undefined;
  const rewriterBase = models.rewrite
    ? createLlmRewriter({ llm, model: models.rewrite })
    : undefined;

  return {
    ...(extractorBase
      ? {
          extractor: {
            extract: async (input) => {
              await gate('classify', input.workspaceId);
              return extractorBase.extract(input);
            },
          } satisfies Extractor,
        }
      : {}),
    ...(drafterBase
      ? {
          drafter: {
            draft: async (input) => {
              await gate('draft', input.workspaceId);
              return drafterBase.draft(input);
            },
          } satisfies Drafter,
        }
      : {}),
    ...(rewriterBase
      ? {
          rewriter: {
            rewrite: async (input) => {
              await gate('rewrite', input.workspaceId);
              return rewriterBase.rewrite(input);
            },
          } satisfies Rewriter,
        }
      : {}),
    ready: async (workspaceId) => {
      let ok = true;
      for (const step of ['classify', 'draft'] as const) {
        const on = await options.isStepEnabled(step, workspaceId);
        if (!on) ok = false;
        else if (!models[step]) {
          warnOnce(step, `thiếu ${step === 'classify' ? 'CLASSIFY_LLM_MODEL' : 'DRAFT_LLM_MODEL'}`);
          ok = false;
        }
      }
      return ok;
    },
  };
}
