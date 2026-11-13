import type { Captioner, CaptionNotReady } from '@flow/ai';
import { describe, expect, it, vi } from 'vitest';
import { type CaptionServiceDeps, createCaptionService } from './caption-service';

function build(
  over: {
    diagnose?: CaptionNotReady | null;
    captioner?: Partial<Captioner> | null;
    warn?: CaptionServiceDeps['warn'];
  } = {},
) {
  const captioner: Captioner = {
    suggestCaption: vi.fn(async () => ({ ok: true as const, text: 'Caption mới' })),
    suggestHashtags: vi.fn(async () => ({ ok: true as const, hashtags: ['#a1', '#b2'] })),
    ...(over.captioner ?? {}),
  };
  const deps: CaptionServiceDeps = {
    diagnose: async () => (over.diagnose === undefined ? null : over.diagnose),
    captioner: () => (over.captioner === null ? undefined : captioner),
    warn: over.warn ?? vi.fn(),
  };
  return { deps, captioner, service: createCaptionService(deps) };
}

describe('createCaptionService.suggest', () => {
  it('caption: trả văn bản gợi ý, gọi đúng captioner với workspace và ý tưởng', async () => {
    const { captioner, service } = build();
    expect(await service.suggest('w1', 'caption', 'ý tưởng')).toEqual({
      ok: true,
      kind: 'caption',
      text: 'Caption mới',
    });
    expect(captioner.suggestCaption).toHaveBeenCalledWith({ workspaceId: 'w1', draft: 'ý tưởng' });
  });

  it('hashtags: trả danh sách thẻ', async () => {
    const { service } = build();
    expect(await service.suggest('w1', 'hashtags', 'nội dung')).toEqual({
      ok: true,
      kind: 'hashtags',
      hashtags: ['#a1', '#b2'],
    });
  });

  it('chưa sẵn sàng: cờ tắt → flag_off; thiếu dịch vụ/model hoặc không có captioner → not_configured; KHÔNG gọi LLM', async () => {
    const off = build({ diagnose: 'flag_off' });
    expect(await off.service.suggest('w1', 'caption', 'x')).toEqual({
      ok: false,
      reason: 'flag_off',
    });
    for (const diagnose of ['missing_service', 'missing_model'] as const) {
      const r = build({ diagnose });
      expect(await r.service.suggest('w1', 'caption', 'x')).toEqual({
        ok: false,
        reason: 'not_configured',
      });
      expect(r.captioner.suggestCaption).not.toHaveBeenCalled();
    }
    expect(await build({ captioner: null }).service.suggest('w1', 'caption', 'x')).toEqual({
      ok: false,
      reason: 'not_configured',
    });
  });

  it('truyền nguyên lý do của bộ soạn: ý tưởng rỗng, số liệu AI tự thêm, đầu ra rỗng', async () => {
    for (const reason of ['empty_input', 'unsupported_claims', 'empty'] as const) {
      const { service } = build({
        captioner: { suggestCaption: async () => ({ ok: false, reason }) },
      });
      expect(await service.suggest('w1', 'caption', 'x')).toEqual({ ok: false, reason });
    }
  });

  it('lỗi LLM_UNAVAILABLE (cờ tắt giữa chừng) → flag_off; lỗi khác → unavailable; nhật ký chỉ có MÃ, không nội dung', async () => {
    const warn = vi.fn();
    const gone = build({
      warn,
      captioner: {
        suggestCaption: async () => {
          throw Object.assign(new Error('x'), { code: 'LLM_UNAVAILABLE' });
        },
      },
    });
    expect(await gone.service.suggest('w1', 'caption', 'x')).toEqual({
      ok: false,
      reason: 'flag_off',
    });
    const broken = build({
      warn,
      captioner: {
        suggestCaption: async () => {
          throw Object.assign(new Error('NỘI DUNG BÍ MẬT'), { code: 'LLM_TIMEOUT' });
        },
      },
    });
    expect(await broken.service.suggest('w1', 'caption', 'NỘI DUNG BÍ MẬT')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(warn).toHaveBeenCalledWith({ event: 'caption_failed', reason: 'LLM_TIMEOUT' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('BÍ MẬT');
  });
});
