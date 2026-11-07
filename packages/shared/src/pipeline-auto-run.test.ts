import { describe, expect, it } from 'vitest';
import { parsePipelineWorkspaceIds, shouldAutoRunPipeline } from './pipeline-auto-run';
import { PIPELINE_QUEUE, pipelineJobSchema } from './queues';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const base = {
  workspaceId: WS,
  ingestSource: 'webhook' as const,
  isOwn: false,
  deleted: false,
  flagEnabled: true,
  allowedWorkspaceIds: [WS],
};

describe('shouldAutoRunPipeline — MỘT nơi quyết định bình luận nào tự chạy pipeline (Q-POR1)', () => {
  it('webhook/polling thường, đúng workspace, cờ bật → chạy', () => {
    expect(shouldAutoRunPipeline(base)).toBe(true);
    expect(shouldAutoRunPipeline({ ...base, ingestSource: 'polling' })).toBe(true);
  });
  it('backfill KHÔNG BAO GIỜ tự chạy (FR-011)', () => {
    expect(shouldAutoRunPipeline({ ...base, ingestSource: 'backfill' })).toBe(false);
  });
  it('của Page / đã xóa → không', () => {
    expect(shouldAutoRunPipeline({ ...base, isOwn: true })).toBe(false);
    expect(shouldAutoRunPipeline({ ...base, deleted: true })).toBe(false);
  });
  it('cờ tắt hoặc workspace ngoài danh sách (danh sách rỗng = không workspace nào) → không', () => {
    expect(shouldAutoRunPipeline({ ...base, flagEnabled: false })).toBe(false);
    expect(shouldAutoRunPipeline({ ...base, allowedWorkspaceIds: [OTHER] })).toBe(false);
    expect(shouldAutoRunPipeline({ ...base, allowedWorkspaceIds: [] })).toBe(false);
  });
});

describe('parsePipelineWorkspaceIds', () => {
  it('tách theo dấu phẩy, bỏ khoảng trắng/rỗng/không phải UUID', () => {
    expect(parsePipelineWorkspaceIds(` ${WS} , x,, ${OTHER}`)).toEqual([WS, OTHER]);
    expect(parsePipelineWorkspaceIds(undefined)).toEqual([]);
    expect(parsePipelineWorkspaceIds('')).toEqual([]);
  });
});

describe('job pipeline', () => {
  it('chỉ nhận id + trigger auto|manual (không nội dung bình luận)', () => {
    expect(PIPELINE_QUEUE).toBe('pipeline');
    expect(
      pipelineJobSchema.safeParse({ workspaceId: WS, commentId: OTHER, trigger: 'auto' }).success,
    ).toBe(true);
    expect(
      pipelineJobSchema.safeParse({ workspaceId: WS, commentId: OTHER, trigger: 'manual' }).success,
    ).toBe(true);
    expect(
      pipelineJobSchema.safeParse({ workspaceId: WS, commentId: OTHER, trigger: 'x' }).success,
    ).toBe(false);
    expect(
      pipelineJobSchema.safeParse({ workspaceId: WS, commentId: 'x', trigger: 'auto' }).success,
    ).toBe(false);
  });
});
