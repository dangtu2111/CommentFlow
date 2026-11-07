import {
  type BrandVoiceRow,
  defaultKnowledgeReaders,
  type Embedder,
  type EmbeddingConsistency,
  loadWorkspaceKnowledge,
  type TryKnowledge,
  type TryKnowledgeSource,
  type TryRunContext,
} from '@flow/ai';
import {
  type Database,
  getCurrentVersion,
  type KbVersionRef,
  type TryShopText,
} from '@flow/db/runtime';

/**
 * Nguồn kiến thức của ô Thử AI (FR-059). Có 3 mức, mức cao hơn thắng:
 * - `kb`: cờ `TRY_AI_KB_REAL=true` + workspace có phiên bản kiến thức đã xuất bản → tìm trong `kb_chunks` (embedding vẫn
 *   là bản fixture, Xong-mock); sản phẩm thật nếu có.
 * - `shop`: workspace đã có sản phẩm hoặc chính sách/FAQ thật → giá/tồn/biến thể đọc từ `products`/`product_variants`
 *   (lát A), chính sách/FAQ đọc từ `policy_items`/`faq_items` (lát B). Ở mức này KHÔNG dùng đoạn mẫu nào nữa (số liệu mẫu
 *   như phí ship không được lẫn vào dữ liệu thật). Tắt bằng `TRY_AI_PRODUCTS_REAL=false`.
 * - `demo`: còn lại → kiến thức mẫu, không đụng DB.
 */
export type { TryKnowledgeSource, TryRunContext };
export type TrySession = { workspaceId: string; userId?: string };

export type KnowledgeRunner = <T>(
  session: TrySession,
  base: TryKnowledge,
  run: (knowledge: TryKnowledge, context: TryRunContext) => Promise<T>,
) => Promise<{ value: T; source: TryKnowledgeSource; embedding: EmbeddingConsistency }>;

/** Nguồn mẫu (không đụng DB): không có kiểm model embedding. */
export const EMBEDDING_OFF: EmbeddingConsistency = {
  state: 'off',
  configuredModel: null,
  mismatches: [],
};

export const isTryAiKbReal = (env: Record<string, string | undefined>): boolean =>
  env.TRY_AI_KB_REAL === 'true';

/** Mặc định BẬT (chỉ đọc dữ liệu của chính workspace, không tốn tiền, không gọi ngoài); tắt bằng đúng chữ `false`. */
export const isTryAiProductsReal = (env: Record<string, string | undefined>): boolean =>
  env.TRY_AI_PRODUCTS_REAL !== 'false';

type ActorDb = {
  withActor<T>(workspaceId: string, userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
};

export function createKnowledgeRunner(options: {
  enabled: boolean;
  /** Dùng sản phẩm thật của workspace (mặc định tắt ở tầng này; nơi dựng đọc `isTryAiProductsReal`). */
  productsEnabled?: boolean;
  db: ActorDb;
  /** Tiêm được để test; mặc định đọc `kb_versions`. */
  currentVersion?: (tx: Database, workspaceId: string) => Promise<KbVersionRef | null>;
  countProducts?: (tx: Database, workspaceId: string) => Promise<number>;
  productNames?: (tx: Database, workspaceId: string) => Promise<string[]>;
  shopTexts?: (tx: Database, workspaceId: string) => Promise<TryShopText[]>;
  abbreviations?: (tx: Database, workspaceId: string) => Promise<Record<string, string>>;
  brandVoices?: (tx: Database, workspaceId: string) => Promise<BrandVoiceRow[]>;
  /** Embedding thật (bge-m3 qua `ml`) khi bật `ML_EMBED_ENABLED`; mặc định bản fixture. */
  embedder?: Embedder;
}): KnowledgeRunner {
  const currentVersion = options.currentVersion ?? getCurrentVersion;
  const countProducts = options.countProducts ?? defaultKnowledgeReaders.countProducts;
  const productNames = options.productNames ?? defaultKnowledgeReaders.productNames;
  const shopTexts = options.shopTexts ?? defaultKnowledgeReaders.shopTexts;
  const abbreviations = options.abbreviations ?? defaultKnowledgeReaders.abbreviations;
  const brandVoices = options.brandVoices ?? defaultKnowledgeReaders.brandVoices;
  const readers = { countProducts, productNames, shopTexts, abbreviations, brandVoices };
  return async (session, base, run) => {
    const demo = async () => ({
      value: await run(base, { productNames: [], abbreviations: {}, voices: {} }),
      source: 'demo' as const,
      embedding: EMBEDDING_OFF,
    });
    if ((!options.enabled && !options.productsEnabled) || !session.userId) return demo();
    const userId = session.userId;
    return options.db.withActor(session.workspaceId, userId, async (tx) => {
      // Phần TÌM kiến thức/sản phẩm dùng CHUNG với worker (`loadWorkspaceKnowledge`, `@flow/ai`); web chỉ chọn tham số.
      const loaded = await loadWorkspaceKnowledge({
        tx,
        workspaceId: session.workspaceId,
        version: options.enabled ? await currentVersion(tx, session.workspaceId) : null,
        productsEnabled: options.productsEnabled === true,
        base,
        ...(options.embedder ? { embedder: options.embedder } : {}),
        readers,
      });
      if (!loaded) return demo();
      return {
        value: await run(loaded.knowledge, loaded.context),
        source: loaded.source,
        embedding: loaded.embedding,
      };
    });
  };
}
