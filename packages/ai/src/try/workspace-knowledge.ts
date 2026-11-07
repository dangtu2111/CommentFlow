import {
  countActiveProducts,
  countEmbeddingModels,
  type Database,
  type EmbeddingModelCounts,
  type KbVersionRef,
  listBrandVoices,
  listTryProductNames,
  loadAbbreviationEntries,
  loadTryShopTexts,
  type TryShopText,
} from '@flow/db/runtime';
import type { Embedder } from '../embedding/embedder';
import {
  type EmbeddingConsistency,
  evaluateEmbeddingConsistency,
  vectorBranchUsable,
} from '../embedding/embedding-consistency';
import { createDbKbSearcher } from '../retrieve/kb-searcher';
import { type BrandVoiceRow, type DraftVoicesByLang, draftVoicesFromRows } from './brand-voice';
import { createDbProductKnowledge } from './db-product-knowledge';
import { createDbShopKnowledgeSearch } from './db-shop-knowledge';
import { createKbTryKnowledge } from './kb-try-knowledge';
import type { TryKnowledge } from './try-pipeline';

/**
 * NGUỒN KIẾN THỨC DÙNG CHUNG (PIPE-ORCHESTRATOR lát E): MỘT hàm cho ô Thử AI (web) và job `pipeline` (worker) — không có bản
 * thứ hai. Hai nơi chỉ khác nhau ở THAM SỐ: (a) giao dịch `tx` (`withActor` / `withJob`), (b) `version` — phiên bản kiến thức
 * nơi gọi đã chọn (cả hai hiện đọc bản ĐÃ XUẤT BẢN; worker KHÔNG BAO GIỜ đọc bản nháp), (c) `productsEnabled`.
 *
 * Mức nguồn (cao thắng): `kb` (có `version`) → `shop` (có sản phẩm/chính sách/FAQ thật) → `demo` (trả `null`, nơi gọi dùng mẫu).
 */
export type TryKnowledgeSource = 'demo' | 'shop' | 'kb';

/** Thông tin thêm cho bộ nhận diện/soạn câu. */
export type TryRunContext = {
  productNames: readonly string[];
  /** Từ điển viết tắt (hệ thống + workspace); rỗng → dùng bản mẫu. */
  abbreviations: Readonly<Record<string, string>>;
  /** Giọng văn THẬT theo ngôn ngữ; rỗng → mặc định. */
  voices: DraftVoicesByLang;
};

/** Nhãn dữ liệu mẫu của DEV (`pnpm dev:seed-demo`): không bao giờ tính là sản phẩm thật. */
export const SAMPLE_LABEL = '[MẪU]';

export type WorkspaceKnowledgeReaders = {
  countProducts: (tx: Database, workspaceId: string) => Promise<number>;
  productNames: (tx: Database, workspaceId: string) => Promise<string[]>;
  shopTexts: (tx: Database, workspaceId: string) => Promise<TryShopText[]>;
  abbreviations: (tx: Database, workspaceId: string) => Promise<Record<string, string>>;
  brandVoices: (tx: Database, workspaceId: string) => Promise<BrandVoiceRow[]>;
  /** Số vector đã lưu theo model (đoạn đã xuất bản + tên sản phẩm) — đầu vào của kiểm lệch model. */
  embeddingCounts: (tx: Database, workspaceId: string) => Promise<EmbeddingModelCounts>;
};

export const defaultKnowledgeReaders: WorkspaceKnowledgeReaders = {
  countProducts: (tx, ws) => countActiveProducts(tx, ws, SAMPLE_LABEL),
  productNames: (tx, ws) => listTryProductNames(tx, ws, SAMPLE_LABEL),
  shopTexts: (tx, ws) => loadTryShopTexts(tx, ws, SAMPLE_LABEL),
  abbreviations: async (tx, ws) => ({
    ...(await loadAbbreviationEntries(tx, ws, 'en')),
    ...(await loadAbbreviationEntries(tx, ws, 'vi')),
  }),
  brandVoices: listBrandVoices,
  embeddingCounts: countEmbeddingModels,
};

export type WorkspaceKnowledge = {
  knowledge: TryKnowledge;
  /**
   * Dựng cùng nguồn kiến thức trên một giao dịch KHÁC: worker KHÔNG giữ giao dịch qua lời gọi LLM nên mỗi lần tìm kiếm mở giao
   * dịch ngắn và gọi `bind(tx)`; kết quả giống hệt `knowledge` (cùng phiên bản, cùng dữ liệu đã đọc).
   */
  bind: (tx: Database) => TryKnowledge;
  context: TryRunContext;
  source: Exclude<TryKnowledgeSource, 'demo'>;
  /** Trạng thái model embedding so với dữ liệu: `mismatch` → nhánh vector đã TẮT (nơi gọi báo cho người dùng); `off` → chưa cấu hình embedding. */
  embedding: EmbeddingConsistency;
  /** `failed` = dịch vụ embedding lỗi trong lượt này → đã suy giảm về toàn văn/trigram (nơi gọi báo sự cố dịch vụ). */
  vectorHealth: { failed: boolean };
};

export type WorkspaceKnowledgeParams = {
  tx: Database;
  workspaceId: string;
  /** Phiên bản kiến thức nơi gọi đã chọn (đã xuất bản); `null` = không dùng `kb_chunks`. */
  version: KbVersionRef | null;
  productsEnabled: boolean;
  /** Nguồn nền (mẫu) khi workspace chưa có sản phẩm thật. */
  base: TryKnowledge;
  /** Embedder thật (cấu hình `resolveEmbeddingConfig`); thiếu → KHÔNG có nhánh vector (toàn văn + trigram). Không có embedder giả khi chạy. */
  embedder?: Embedder;
  /** `cf.embedding_state.revision` hiện hành: khóa bộ nhớ trạng thái lệch model (đổi model → revision đổi → đếm lại). */
  embeddingRevision?: number;
  /** Gọi khi embedder lỗi giữa lượt (đã suy giảm về toàn văn/trigram); không kèm nội dung. */
  onEmbeddingFailure?: (error: unknown) => void;
  readers?: Partial<WorkspaceKnowledgeReaders>;
};

const CONSISTENCY_TTL_MS = 60_000;
const CONSISTENCY_MAX = 500;
const consistencyCache = new Map<string, { at: number; status: EmbeddingConsistency }>();

/** Bộ nhớ ngắn hạn theo (workspace, kb_version, revision, model): không đếm model mỗi lượt. Chỉ dùng khi biết `revision` (khóa đủ chặt). */
async function consistencyOf(
  _model: string,
  compute: () => Promise<EmbeddingConsistency>,
  key: string,
  cacheable: boolean,
): Promise<EmbeddingConsistency> {
  if (!cacheable) return compute();
  const hit = consistencyCache.get(key);
  if (hit && Date.now() - hit.at < CONSISTENCY_TTL_MS) return hit.status;
  const status = await compute();
  if (consistencyCache.size >= CONSISTENCY_MAX) consistencyCache.clear();
  consistencyCache.set(key, { at: Date.now(), status });
  return status;
}

/** `null` = chưa có dữ liệu thật nào → nơi gọi dùng kiến thức mẫu (`demo`). */
export async function loadWorkspaceKnowledge(
  params: WorkspaceKnowledgeParams,
): Promise<WorkspaceKnowledge | null> {
  const { tx, workspaceId, version, base } = params;
  const r = { ...defaultKnowledgeReaders, ...params.readers };
  const hasProducts = params.productsEnabled ? (await r.countProducts(tx, workspaceId)) > 0 : false;
  const texts = params.productsEnabled ? await r.shopTexts(tx, workspaceId) : [];
  if (!version && !hasProducts && texts.length === 0) return null;
  const context: TryRunContext = {
    productNames: hasProducts ? await r.productNames(tx, workspaceId) : [],
    abbreviations: await r.abbreviations(tx, workspaceId),
    voices: draftVoicesFromRows(await r.brandVoices(tx, workspaceId)),
  };
  // Kiểm lệch model (FR-133): chỉ dùng nhánh vector khi model cấu hình KHỚP dữ liệu đã lưu; lệch → toàn văn/trigram, không trộn vector khác model.
  const embedding = params.embedder
    ? await consistencyOf(
        params.embedder.model,
        async () =>
          evaluateEmbeddingConsistency({
            configuredModel: params.embedder?.model ?? null,
            ...(await r.embeddingCounts(tx, workspaceId)),
          }),
        `${workspaceId}:${version?.id ?? '-'}:${params.embeddingRevision ?? '-'}:${params.embedder.model}`,
        params.embeddingRevision !== undefined,
      )
    : evaluateEmbeddingConsistency({ configuredModel: null, chunks: [], products: [] });
  const vectorHealth = { failed: false };
  const embedder = params.embedder && vectorBranchUsable(embedding) ? params.embedder : undefined;
  const bind = (t: Database): TryKnowledge => {
    const products = hasProducts ? createDbProductKnowledge(t, workspaceId) : base;
    if (!version) return { ...products, searchKb: createDbShopKnowledgeSearch(texts) };
    return createKbTryKnowledge({
      searcher: createDbKbSearcher(t, { workspaceId, versionId: version.id }),
      ...(embedder ? { embedder } : {}),
      onVectorFailure: (error) => {
        vectorHealth.failed = true;
        params.onEmbeddingFailure?.(error);
      },
      base: products,
    });
  };
  return {
    knowledge: bind(tx),
    bind,
    context,
    source: version ? 'kb' : 'shop',
    embedding,
    vectorHealth,
  };
}
