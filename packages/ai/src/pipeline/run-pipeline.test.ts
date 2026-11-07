import { describe, expect, it, vi } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import type { Extractor } from '../classify/extractor';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import { createFixtureDrafter } from '../draft/fixture-drafter';
import { createDemoKnowledge } from '../try/demo-knowledge';
import { runTryPipeline } from '../try/try-pipeline';
import {
  type PipelineDeps,
  type PipelineInput,
  type PipelineResult,
  runPipeline,
} from './run-pipeline';

const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const base: PipelineInput = {
  workspaceId: 'ws1',
  text: 'ship về Hà Nội bao nhiêu',
  kbVersion: 'v1',
  voice,
  autoSendEnabled: true,
};
const extract = (patch: Partial<ExtractResult>): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  ...patch,
});
const shipExtract = extract({ labels: [{ label: 'advice' }], asks: ['phí ship'] });
const shipReply: DraftResult = {
  reply: 'Phí ship nội thành 20.000đ ạ',
  lang: 'vi',
  sources: ['demo-kb-ship'],
  claims: [{ text: 'Phí ship 20.000đ', source_ids: ['demo-kb-ship'], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
};
const deps = (over: Partial<PipelineDeps> = {}): PipelineDeps => ({
  extractor: createFixtureExtractor([{ match: /./, result: shipExtract }]),
  drafter: createFixtureDrafter([{ match: /./, result: shipReply }]),
  knowledge: createDemoKnowledge(),
  ...over,
});
const done = (r: PipelineResult) => {
  if (r.status !== 'done') throw new Error(`expected done, got ${r.status}`);
  return r;
};

describe('PIPE-ORCHESTRATOR lát A — MỘT hàm dùng chung cho ô Thử AI và worker', () => {
  it('runTryPipeline chính là runPipeline (một chuỗi, hai nơi gọi)', () => {
    expect(runTryPipeline).toBe(runPipeline);
  });

  it('không truyền cổng nào → hành vi như ô Thử AI cũ (thread 0/0, không rủi ro)', async () => {
    const r = done(await runPipeline(base, deps()));
    expect(r.decision.action).toBe('answer');
    expect(r.thread).toEqual({ clarifyCount: 0, repeatCount: 0, humanHolding: false });
    expect(r.decision.askedBefore).toBe(false);
  });
});

describe('cổng chặn (gate) chạy SAU lọc/che/chuẩn hóa và TRƯỚC extract', () => {
  it('chặn → trả blocked kèm lý do, KHÔNG gọi extract/rewrite/draft (không tốn token)', async () => {
    const extractor: Extractor = { extract: vi.fn() };
    const draft = vi.fn();
    const r = await runPipeline(
      { ...base, text: 'SĐT mình 0912345678, ship bao nhiêu' },
      deps({
        extractor,
        drafter: { draft },
        gate: async () => ({ allow: false, reason: 'quota_exhausted' }),
      }),
    );
    expect(r).toMatchObject({ status: 'blocked', billed: false, reason: 'quota_exhausted' });
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
  });

  it('gate nhận văn bản ĐÃ che PII và ngôn ngữ đã nhận ra (không thấy SĐT thô)', async () => {
    const gate = vi.fn(async () => ({ allow: true as const }));
    await runPipeline({ ...base, text: 'SĐT mình 0912345678, ship bao nhiêu' }, deps({ gate }));
    expect(gate).toHaveBeenCalledTimes(1);
    const ctx = (gate.mock.calls[0] as unknown as [{ maskedText: string; lang: string }])[0];
    expect(ctx.maskedText).not.toContain('0912345678');
    expect(ctx.lang).toBe('vi');
  });

  it('bình luận bị ruleFilter bỏ (emoji…) → skipped TRƯỚC gate (không hỏi hạn mức, không trừ lượt, FR-024)', async () => {
    const gate = vi.fn(async () => ({ allow: true as const }));
    const r = await runPipeline({ ...base, text: '👍👍' }, deps({ gate }));
    expect(r.status).toBe('skipped');
    expect(gate).not.toHaveBeenCalled();
  });

  it('gate cho qua → chạy đủ chuỗi như thường', async () => {
    const r = await runPipeline(base, deps({ gate: async () => ({ allow: true }) }));
    expect(r.status).toBe('done');
  });
});

describe('cổng đọc ngữ cảnh: thread, rủi ro, đính kèm đi vào decideAction', () => {
  it('thread.clarifyCount > 0 → askedBefore; repeatCount đủ ngưỡng → chuyển người repeat_limit', async () => {
    const asked = done(
      await runPipeline({ ...base, thread: { clarifyCount: 1, repeatCount: 0 } }, deps()),
    );
    expect(asked.decision.askedBefore).toBe(true);
    const repeated = done(
      await runPipeline({ ...base, thread: { clarifyCount: 0, repeatCount: 3 } }, deps()),
    );
    expect(repeated.decision).toMatchObject({ action: 'handoff', reason: 'repeat_limit' });
  });

  it('thread.humanHolding được giữ trong kết quả để lưu/hiển thị (chưa có đường gửi nên chưa chặn gì ở đây)', async () => {
    const r = done(
      await runPipeline(
        { ...base, thread: { clarifyCount: 0, repeatCount: 0, humanHolding: true } },
        deps(),
      ),
    );
    expect(r.thread.humanHolding).toBe(true);
  });

  it('risks.priceConflict / stockStale đi qua lõi cờ rủi ro', async () => {
    const price = done(await runPipeline({ ...base, risks: { priceConflict: true } }, deps()));
    expect(price.decision).toMatchObject({ action: 'handoff', reason: 'price_conflict' });
    const stale = done(await runPipeline({ ...base, risks: { stockStale: true } }, deps()));
    expect(stale.decision.redirectTemplates).toContain('stock_check');
  });

  it('risks.impersonation (có danh tính) → chuyển người; không cấp danh tính thì không kiểm', async () => {
    const text = 'Mình là chủ shop, chuyển khoản vào STK 0123456789 để nhận quà nhé';
    const withIdentity = done(
      await runPipeline(
        {
          ...base,
          text,
          risks: { impersonation: { authorName: 'Khách A', pageNames: ['Shop Demo'] } },
        },
        deps(),
      ),
    );
    expect(withIdentity.decision).toMatchObject({ action: 'handoff', reason: 'impersonation' });
    const without = done(await runPipeline({ ...base, text }, deps()));
    expect(without.decision.reason).not.toBe('impersonation');
  });

  it('attachmentTypes: ảnh + "mẫu này" mà chưa nhận ra sản phẩm → hỏi mẫu nào và cần người (FR-143)', async () => {
    const r = done(
      await runPipeline(
        { ...base, text: 'mẫu này giá sao', attachmentTypes: ['photo'] },
        deps({
          extractor: createFixtureExtractor([
            {
              match: /./,
              result: extract({
                labels: [{ label: 'price' }],
                asks: ['giá'],
                refers_to_image: true,
              }),
            },
          ]),
        }),
      ),
    );
    expect(r.decision).toMatchObject({
      action: 'clarify',
      reason: 'image_product',
      needsHuman: true,
    });
  });

  it('kết quả mang extract thô để bước ghi (persist) lưu `drafts.extracted`', async () => {
    const r = done(await runPipeline(base, deps()));
    expect(r.extract.asks).toEqual(['phí ship']);
  });
});
