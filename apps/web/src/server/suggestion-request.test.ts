import { describe, expect, it, vi } from 'vitest';
import {
  canRequestSuggestion,
  createSuggestionRequest,
  SUGGESTION_DEBOUNCE_SECONDS,
  type SuggestionDeps,
} from './suggestion-request';

const ID = '11111111-1111-4111-8111-111111111111';
const session = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
};

function deps(over: Partial<SuggestionDeps> = {}): SuggestionDeps & { jobs: unknown[] } {
  const jobs: unknown[] = [];
  return {
    jobs,
    find: async () => ({ status: 'needs_human', deletedAt: null }),
    enqueue: async (job, options) => {
      jobs.push([job, options]);
    },
    pipelineEnabled: async () => true,
    warn: () => {},
    ...over,
  };
}

describe('nút "Soạn gợi ý" — điều kiện hiển thị', () => {
  it('chỉ bình luận `new` hoặc `needs_human` và chưa bị xóa', () => {
    expect(canRequestSuggestion({ status: 'new', deletedAt: null })).toBe(true);
    expect(canRequestSuggestion({ status: 'needs_human', deletedAt: null })).toBe(true);
    for (const status of [
      'processing',
      'pending_review',
      'replied',
      'sending',
      'skipped',
      'hidden',
    ]) {
      expect(canRequestSuggestion({ status, deletedAt: null }), status).toBe(false);
    }
    expect(canRequestSuggestion({ status: 'new', deletedAt: new Date() })).toBe(false);
  });
});

describe('nút "Soạn gợi ý" — yêu cầu', () => {
  it('hợp lệ → đẩy job manual kèm NGƯỜI BẤM (từ phiên) và khóa chống bấm đúp theo bình luận', async () => {
    const d = deps();
    expect(await createSuggestionRequest(d)(session, ID)).toEqual({ ok: true });
    expect(d.jobs).toEqual([
      [
        {
          workspaceId: session.workspaceId,
          commentId: ID,
          trigger: 'manual',
          requestedBy: session.userId,
        },
        { singletonKey: `manual:${ID}`, singletonSeconds: SUGGESTION_DEBOUNCE_SECONDS },
      ],
    ]);
  });

  it('id không phải UUID / không thấy (workspace khác, RLS) → not_found, không đẩy job', async () => {
    const d = deps({ find: async () => null });
    expect(await createSuggestionRequest(d)(session, 'x')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await createSuggestionRequest(d)(session, ID)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(d.jobs).toHaveLength(0);
  });

  it('bình luận không đủ điều kiện (đã có bản chờ duyệt, đang xử lý, đã xóa) → not_eligible, không đẩy job', async () => {
    for (const row of [
      { status: 'pending_review', deletedAt: null },
      { status: 'processing', deletedAt: null },
      { status: 'new', deletedAt: new Date() },
    ]) {
      const d = deps({ find: async () => row });
      expect(await createSuggestionRequest(d)(session, ID)).toEqual({
        ok: false,
        reason: 'not_eligible',
      });
      expect(d.jobs).toHaveLength(0);
    }
  });

  it('pipeline chưa bật → pipeline_off, không đọc DB, không đẩy job', async () => {
    const find = vi.fn();
    const d = deps({ pipelineEnabled: async () => false, find });
    expect(await createSuggestionRequest(d)(session, ID)).toEqual({
      ok: false,
      reason: 'pipeline_off',
    });
    expect(find).not.toHaveBeenCalled();
    expect(d.jobs).toHaveLength(0);
  });

  it('lỗi đọc DB hoặc đẩy hàng đợi → unavailable (log chỉ tên lỗi, không nội dung)', async () => {
    const warn = vi.fn();
    const failFind = deps({
      find: async () => {
        throw new TypeError('boom');
      },
      warn,
    });
    expect(await createSuggestionRequest(failFind)(session, ID)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    const failQueue = deps({
      enqueue: async () => {
        throw new RangeError('queue');
      },
      warn,
    });
    expect(await createSuggestionRequest(failQueue)(session, ID)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      { event: 'suggestion_lookup_failed', reason: 'TypeError' },
      { event: 'suggestion_enqueue_failed', reason: 'RangeError' },
    ]);
  });
});
