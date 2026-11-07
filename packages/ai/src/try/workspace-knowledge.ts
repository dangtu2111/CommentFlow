import {
  countActiveProducts,
  type Database,
  type KbVersionRef,
  listBrandVoices,
  listTryProductNames,
  loadAbbreviationEntries,
  loadTryShopTexts,
  type TryShopText,
} from '@flow/db/runtime';
import { createFixtureEmbedder } from '../embedding';
import type { Embedder } from '../embedding/embedder';
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
};

export type WorkspaceKnowledgeParams = {
  tx: Database;
  workspaceId: string;
  /** Phiên bản kiến thức nơi gọi đã chọn (đã xuất bản); `null` = không dùng `kb_chunks`. */
  version: KbVersionRef | null;
  productsEnabled: boolean;
  /** Nguồn nền (mẫu) khi workspace chưa có sản phẩm thật. */
  base: TryKnowledge;
  /** Embedding thật khi bật `ML_EMBED_ENABLED`; mặc định bản fixture. */
  embedder?: Embedder;
  readers?: Partial<WorkspaceKnowledgeReaders>;
};

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
  const embedder = params.embedder ?? createFixtureEmbedder();
  const bind = (t: Database): TryKnowledge => {
    const products = hasProducts ? createDbProductKnowledge(t, workspaceId) : base;
    if (!version) return { ...products, searchKb: createDbShopKnowledgeSearch(texts) };
    return createKbTryKnowledge({
      searcher: createDbKbSearcher(t, { workspaceId, versionId: version.id }),
      embedder,
      base: products,
    });
  };
  return { knowledge: bind(tx), bind, context, source: version ? 'kb' : 'shop' };
}
