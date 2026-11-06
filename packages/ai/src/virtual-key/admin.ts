import { AppError } from '@flow/shared';
import { z } from 'zod';

/**
 * Quản trị khóa ảo LiteLLM (AI-VIRTUALKEY, FR-034). Dùng master key — CHỈ ở tầng này, không bao giờ
 * đi vào đường gọi LLM thường (`llm-client` chỉ nhận khóa ảo). Lỗi không chứa master key/khóa/phản hồi.
 * API LiteLLM: POST /key/generate, /key/update, /key/delete (docs.litellm.ai/docs/proxy/virtual_keys).
 */

export type KeySpec = {
  alias: string;
  maxBudgetUsd: number;
  budgetDuration: string;
  workspaceId: string;
};

export type VirtualKeyAdmin = {
  generate(spec: KeySpec): Promise<{ key: string }>;
  update(key: string, patch: { maxBudgetUsd: number }): Promise<void>;
  revoke(key: string): Promise<void>;
};

export type LiteLlmKeyAdminOptions = {
  baseUrl: string;
  masterKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const generateResponseSchema = z.object({ key: z.string().min(1) });

export function createLiteLlmKeyAdmin(options: LiteLlmKeyAdminOptions): VirtualKeyAdmin {
  if (options.baseUrl.trim() === '' || options.masterKey === '') {
    throw new AppError('CONFIG_INVALID', 'Thiếu địa chỉ hoặc khóa quản trị LiteLLM.');
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.masterKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AppError('LLM_UNAVAILABLE', 'Không kết nối được dịch vụ quản trị khóa AI.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('CONFIG_INVALID', 'Khóa quản trị LiteLLM không hợp lệ hoặc thiếu quyền.');
    }
    if (!response.ok) {
      throw new AppError(
        'LLM_UNAVAILABLE',
        `Dịch vụ quản trị khóa AI trả về lỗi HTTP ${response.status}.`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new AppError('LLM_UNAVAILABLE', 'Phản hồi quản trị khóa AI không đúng định dạng.');
    }
  }

  return {
    async generate(spec) {
      const raw = await post('/key/generate', {
        key_alias: spec.alias,
        max_budget: spec.maxBudgetUsd,
        budget_duration: spec.budgetDuration,
        metadata: { workspace_id: spec.workspaceId },
      });
      const parsed = generateResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError('LLM_UNAVAILABLE', 'Phản hồi cấp khóa AI không đúng định dạng.');
      }
      return { key: parsed.data.key };
    },
    async update(key, patch) {
      await post('/key/update', { key, max_budget: patch.maxBudgetUsd });
    },
    async revoke(key) {
      await post('/key/delete', { keys: [key] });
    },
  };
}

export type MockKeyAdmin = VirtualKeyAdmin & {
  generateCount: number;
  has(key: string): boolean;
  budgetOf(key: string): number;
  aliasOf(key: string): string;
  recordSpend(key: string, usd: number): void;
  isExhausted(key: string): boolean;
};

type MockKey = { alias: string; maxBudgetUsd: number; spentUsd: number };

/** Bản bộ nhớ cho test/dev (mock): không mạng; khóa ngắn, không giống bí mật. */
export function createMockKeyAdmin(): MockKeyAdmin {
  const keys = new Map<string, MockKey>();
  let counter = 0;
  const need = (key: string): MockKey => {
    const found = keys.get(key);
    if (!found) throw new AppError('NOT_FOUND', 'Không thấy khóa ảo.');
    return found;
  };
  const admin: MockKeyAdmin = {
    generateCount: 0,
    async generate(spec) {
      counter += 1;
      admin.generateCount += 1;
      const key = `vk-mock-${counter}`;
      keys.set(key, { alias: spec.alias, maxBudgetUsd: spec.maxBudgetUsd, spentUsd: 0 });
      return { key };
    },
    async update(key, patch) {
      need(key).maxBudgetUsd = patch.maxBudgetUsd;
    },
    async revoke(key) {
      need(key);
      keys.delete(key);
    },
    has: (key) => keys.has(key),
    budgetOf: (key) => need(key).maxBudgetUsd,
    aliasOf: (key) => need(key).alias,
    recordSpend(key, usd) {
      need(key).spentUsd += usd;
    },
    isExhausted(key) {
      const k = need(key);
      return k.spentUsd >= k.maxBudgetUsd;
    },
  };
  return admin;
}
