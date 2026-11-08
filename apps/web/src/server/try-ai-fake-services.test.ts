import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDemoKnowledge, createTryQuota } from '@flow/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeLitellm } from '../../../../e2e/fake-services/fake-litellm.mjs';
import { demoKnowledgeRunner } from './test-demo-wiring';
import { createTryAiAction } from './try-ai';
import { createTryLlmDeps } from './try-ai-llm';

/**
 * Bảo đảm dịch vụ LLM GIẢ của CI/E2E (e2e/fake-services) tương thích với client THẬT và bộ đọc/kiểm của pipeline: ô Thử AI chạy đủ chuỗi với
 * `createLlmClient` → HTTP → dịch vụ giả, không có đường mock nào trong mã ứng dụng. Kết quả KHÔNG phải số đo chất lượng.
 */
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createFakeLitellm();
  baseUrl = await new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );
});
afterAll(() => server.close());

describe('Thử AI với client LLM thật trỏ vào dịch vụ giả của CI', () => {
  it('ra nhãn, hành động, câu trả lời có nguồn — qua guard của pipeline', async () => {
    const llm = createTryLlmDeps({
      env: {
        LITELLM_BASE_URL: baseUrl,
        LITELLM_API_KEY: 'e2e-virtual-key',
        CLASSIFY_LLM_MODEL: 'e2e-fake-model',
        DRAFT_LLM_MODEL: 'e2e-fake-model',
      },
      // Cờ cf.ai.* theo workspace (DB) — ở test này bật cả hai bước.
      isStepEnabled: async () => true,
      // Ghi `ai_usage` do DB; ở test này chỉ cần trả một dòng (không phải đường mock của ứng dụng).
      db: {
        withWorkspace: (async (_w: string, fn: (tx: unknown) => unknown) =>
          fn({
            insert: () => ({ values: () => ({ returning: async () => [{ id: 'usage-1' }] }) }),
          })) as never,
      },
    });
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      llm,
      // Kiến thức mẫu của test (cắm qua tham số); ứng dụng thật dùng nguồn DB của workspace.
      knowledgeRunner: (session, _base, fn) =>
        demoKnowledgeRunner(session, createDemoKnowledge(), fn),
    });
    const r = await run(
      { workspaceId: '11111111-1111-4111-8111-111111111111', userId: 'u1' },
      'ship về Hà Nội mất bao lâu ạ',
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.result.status !== 'done')
      throw new Error(`không ra kết quả: ${JSON.stringify(r)}`);
    expect(r.result.label).toBe('advice');
    expect(r.result.decision.action).toBe('answer');
    expect(r.result.reply).toContain('Dạ shop gửi bạn thông tin');
    expect(r.result.candidates.length).toBeGreaterThan(0);
    expect(r.llm).toEqual({ extractor: true, drafter: true, rewriter: false });
  });
});
