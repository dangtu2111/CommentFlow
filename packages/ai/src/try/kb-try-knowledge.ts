import { unsafeMarkMasked } from '@flow/shared';
import type { KbGapTopic } from '../decide/decide-action';
import type { Embedder } from '../embedding/embedder';
import { scanInjection } from '../injection/injection-scan';
import type { KbSearcher } from '../retrieve/kb-searcher';
import { type KbHit, rrfRelevance } from '../retrieve/sources';
import { type TryCandidate, type TryKnowledge, topicOf } from './try-pipeline';

/**
 * Bản nối KB cho ô Thử AI (KB-TRYAI, FR-059): `searchKb` nhúng câu hỏi rồi gọi `KbSearcher` (bản DB bọc
 * `searchKbChunks`), điểm hiển thị = `rrfRelevance` (0..1, do code tính — không phải số model tự chấm).
 * Sản phẩm (giá/tồn) KHÔNG đi qua đây: đọc từ `base` (bảng sản phẩm, nguyên tắc #4).
 */
export type KbTryKnowledgeDeps = {
  searcher: KbSearcher;
  /** Thiếu (cấu hình embedding tắt) → KHÔNG có nhánh vector: chỉ toàn văn + trigram. KHÔNG có embedder giả khi chạy. */
  embedder?: Embedder;
  base: Pick<TryKnowledge, 'matchProducts' | 'lookupProductFacts'>;
};

function chunkTopics(hit: KbHit): KbGapTopic[] {
  const topic = topicOf(`${hit.contextHeader ?? ''} ${hit.content}`);
  return topic === 'other' ? [] : [topic];
}

export function createKbTryKnowledge(deps: KbTryKnowledgeDeps): TryKnowledge {
  return {
    matchProducts: (mentions) => deps.base.matchProducts(mentions),
    lookupProductFacts: (ids) => deps.base.lookupProductFacts(ids),
    async searchKb(query, context) {
      // Có embedder → thêm nhánh vector (cùng model với dữ liệu: DB chỉ so vector cùng `embedding_model`); không → toàn văn + trigram.
      const queryVector = deps.embedder ? (await deps.embedder.embed([query]))[0] : undefined;
      if (deps.embedder && !queryVector) return [];
      const hits = await deps.searcher({
        queryText: query,
        lang: context.lang,
        ...(queryVector && deps.embedder
          ? { queryVector, embeddingModel: deps.embedder.model }
          : {}),
        productIds: context.productIds,
      });
      const candidates: TryCandidate[] = [];
      for (const hit of hits) {
        const text = hit.contextHeader ? `${hit.contextHeader}\n${hit.content}` : hit.content;
        // Cùng lớp phòng thủ như `kbHitsToSources` (FR-164): đoạn nghi cài lệnh không được hiện/đưa vào soạn.
        if (scanInjection(text, { allowedDomains: [] }).suspected) continue;
        candidates.push({
          id: `kb:${hit.id}`,
          kind: 'kb',
          title: hit.contextHeader ?? hit.chunkKey,
          text: unsafeMarkMasked(hit.content),
          score: rrfRelevance(hit.score),
          topics: chunkTopics(hit),
        });
      }
      return candidates.sort((a, b) => b.score - a.score);
    },
  };
}
