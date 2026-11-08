import { isKbTopic, type KbTopic, unsafeMarkMasked } from '@flow/shared';
import type { KbGapTopic } from '../decide/decide-action';
import type { Embedder } from '../embedding/embedder';
import type { Reranker } from '../embedding/ml-reranker';
import { scanInjection } from '../injection/injection-scan';
import type { KbSearcher } from '../retrieve/kb-searcher';
import { shouldRerank } from '../retrieve/rerank-policy';
import {
  type KbHit,
  kbRelevanceFromCosine,
  kbRelevanceFromRerank,
  rrfRelevance,
} from '../retrieve/sources';
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
  /** Gọi khi embedder lỗi (ml chết/trả sai model): lượt vẫn chạy bằng toàn văn + trigram (suy giảm, không mock); nơi gọi ghi nhận sự cố. */
  onVectorFailure?: (error: unknown) => void;
  /** Rerank THẬT qua ml (bge-reranker-v2-m3): có → "đủ liên quan" quyết định bằng điểm rerank; thiếu hoặc lỗi → cosine. Không có bản giả khi chạy. */
  reranker?: Reranker;
  /** Gọi khi reranker lỗi giữa lượt (đã suy giảm về cosine); không kèm nội dung. */
  onRerankFailure?: (error: unknown) => void;
  base: Pick<TryKnowledge, 'matchProducts' | 'lookupProductFacts'>;
};

function chunkTopics(hit: KbHit): KbGapTopic[] {
  const topic = topicOf(`${hit.contextHeader ?? ''} ${hit.content}`);
  return topic === 'other' ? [] : [topic];
}

/** Chủ đề của nhóm mâu thuẫn nếu đoạn mang cờ `conflict_group` (ghi lúc xuất bản). */
function conflictTopicOf(hit: KbHit): KbTopic | undefined {
  const meta = hit.metadata;
  if (!meta || typeof meta.conflict_group !== 'string') return undefined;
  return isKbTopic(meta.topic) ? meta.topic : undefined;
}

/** Số đoạn đầu (theo RRF) đem rerank: đủ rộng để không bỏ sót đoạn đúng, đủ hẹp để độ trễ/CPU của ml chấp nhận được. */
const RERANK_TOP = 10;

export function createKbTryKnowledge(deps: KbTryKnowledgeDeps): TryKnowledge {
  return {
    matchProducts: (mentions) => deps.base.matchProducts(mentions),
    lookupProductFacts: (ids) => deps.base.lookupProductFacts(ids),
    async searchKb(query, context) {
      // Có embedder → thêm nhánh vector (cùng model với dữ liệu: DB chỉ so vector cùng `embedding_model`); không → toàn văn + trigram.
      let queryVector: readonly number[] | undefined;
      if (deps.embedder) {
        try {
          queryVector = (await deps.embedder.embed([query]))[0];
          if (!queryVector) return [];
        } catch (error) {
          deps.onVectorFailure?.(error);
        }
      }
      const hits = await deps.searcher({
        queryText: query,
        lang: context.lang,
        ...(queryVector && deps.embedder
          ? { queryVector, embeddingModel: deps.embedder.model }
          : {}),
        productIds: context.productIds,
      });
      const candidates: TryCandidate[] = [];
      const rerankTexts: string[] = []; // song song với `candidates`: "header + nội dung" đem chấm rerank
      // Chưa nhận ra sản phẩm nào: đoạn của MỘT sản phẩm bất kỳ không phải nguồn cho câu hỏi chung ("how much?", "còn hàng không?") — nếu không, mọi câu
      // thiếu sản phẩm đều bị coi là "có nguồn" và trả lời thay vì hỏi lại. Chỉ giữ đoạn dùng chung (chính sách, FAQ, thông tin shop).
      const usableHits =
        context.productIds.length === 0 ? hits.filter((hit) => hit.productId === null) : hits;
      for (const hit of usableHits) {
        const text = hit.contextHeader ? `${hit.contextHeader}\n${hit.content}` : hit.content;
        // Cùng lớp phòng thủ như `kbHitsToSources` (FR-164): đoạn nghi cài lệnh không được hiện/đưa vào soạn.
        if (scanInjection(text, { allowedDomains: [] }).suspected) continue;
        rerankTexts.push(text);
        candidates.push({
          id: `kb:${hit.id}`,
          kind: 'kb',
          title: hit.contextHeader ?? hit.chunkKey,
          text: unsafeMarkMasked(hit.content),
          // Có vector → điểm TUYỆT ĐỐI theo cosine (RRF chỉ để xếp thứ tự); không có → như cũ (suy giảm).
          score:
            hit.cosine === null || hit.cosine === undefined
              ? rrfRelevance(hit.score)
              : kbRelevanceFromCosine(hit.cosine),
          topics: chunkTopics(hit),
          ...(conflictTopicOf(hit) ? { conflictTopic: conflictTopicOf(hit) } : {}),
        });
      }
      if (deps.reranker && candidates.length > 0 && shouldRerank(query, context.lang)) {
        // Chỉ rerank RERANK_TOP đoạn đầu (kết quả tìm đã xếp theo RRF + ưu tiên nhẹ ngôn ngữ).
        const top = candidates.slice(0, RERANK_TOP);
        try {
          const scores = await deps.reranker.rerank(query, rerankTexts.slice(0, RERANK_TOP));
          return top
            .map((c, i) => ({ ...c, score: kbRelevanceFromRerank(scores[i] as number) }))
            .sort((a, b) => b.score - a.score);
        } catch (error) {
          deps.onRerankFailure?.(error);
        }
      }
      return candidates.sort((a, b) => b.score - a.score);
    },
  };
}
