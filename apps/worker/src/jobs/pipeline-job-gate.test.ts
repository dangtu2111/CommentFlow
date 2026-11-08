import type { FlowDb } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import { runPipelineJob } from './pipeline-job';

/** Cờ DB cf.ai.* tắt (hoặc cấu hình thiếu) cho workspace → lượt bị bỏ qua NGAY, không đụng DB, không tốn lượt AI. */
describe('runPipelineJob — cổng cờ AI theo workspace', () => {
  const job = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    commentId: '22222222-2222-4222-8222-222222222222',
    trigger: 'auto' as const,
  };

  it('llmReady = false → ignored/ai_disabled, không gọi DB', async () => {
    const withJob = vi.fn();
    const db = { withJob } as unknown as FlowDb;
    const llmReady = vi.fn(async () => false);
    const outcome = await runPipelineJob(
      {
        db,
        llm: { extractor: {} as never, drafter: {} as never },
        pipelineEnabled: async () => true,
        turnLimit: 100,
        llmReady,
      },
      job,
    );
    expect(outcome).toEqual({ kind: 'ignored', reason: 'ai_disabled' });
    expect(llmReady).toHaveBeenCalledWith(job.workspaceId);
    expect(withJob).not.toHaveBeenCalled();
  });
});
