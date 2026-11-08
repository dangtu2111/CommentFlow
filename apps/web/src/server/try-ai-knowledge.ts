import {
  type BrandVoiceRow,
  defaultKnowledgeReaders,
  type EmbeddingConsistency,
  type EmbeddingOffReason,
  type EmbeddingResolution,
  loadWorkspaceKnowledge,
  type TryKnowledge,
  type TryKnowledgeSource,
  type TryRunContext,
  type WorkspaceKnowledgeReaders,
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
 * - còn lại (chưa có dữ liệu thật nào, hoặc cờ đọc dữ liệu thật đang tắt) → `NoKnowledgeError`: ô Thử AI báo "chưa có kiến thức để thử", KHÔNG dùng kiến thức mẫu.
 */
export type { TryKnowledgeSource, TryRunContext };
export type TrySession = { workspaceId: string; userId?: string };

/** Tìm vector tắt vì sao (`unreadable` = không đọc được trạng thái embedding ở DB) và dịch vụ embedding có lỗi giữa lượt không. */
export type VectorStatus = { off: EmbeddingOffReason | 'unreadable' | null; failed: boolean };

export type KnowledgeRunner = <T>(
  session: TrySession,
  base: TryKnowledge,
  run: (knowledge: TryKnowledge, context: TryRunContext) => Promise<T>,
) => Promise<{
  value: T;
  source: Exclude<TryKnowledgeSource, 'demo'>;
  embedding: EmbeddingConsistency;
  vector: VectorStatus;
}>;

/** Workspace chưa có kiến thức/sản phẩm thật nào để thử (hoặc tính năng đọc dữ liệu thật đang tắt). */
export class NoKnowledgeError extends Error {
  constructor() {
    super('no_knowledge');
    this.name = 'NoKnowledgeError';
  }
}

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
  embeddingCounts?: WorkspaceKnowledgeReaders['embeddingCounts'];
  /**
   * Cấu hình embedding (model hoạt động từ DB + dịch vụ ml từ env) — `createEmbeddingResolver`. Thiếu/`off`/lỗi đọc → không có nhánh vector
   * (toàn văn + trigram); KHÔNG có embedder giả khi chạy.
   */
  resolveEmbedding?: (tx: Database) => Promise<EmbeddingResolution>;
  /** Ghi nhận sự cố dịch vụ embedding giữa lượt (không kèm nội dung). */
  onEmbeddingFailure?: (error: unknown) => void;
}): KnowledgeRunner {
  const currentVersion = options.currentVersion ?? getCurrentVersion;
  const countProducts = options.countProducts ?? defaultKnowledgeReaders.countProducts;
  const productNames = options.productNames ?? defaultKnowledgeReaders.productNames;
  const shopTexts = options.shopTexts ?? defaultKnowledgeReaders.shopTexts;
  const abbreviations = options.abbreviations ?? defaultKnowledgeReaders.abbreviations;
  const brandVoices = options.brandVoices ?? defaultKnowledgeReaders.brandVoices;
  const embeddingCounts = options.embeddingCounts ?? defaultKnowledgeReaders.embeddingCounts;
  const readers = {
    countProducts,
    productNames,
    shopTexts,
    abbreviations,
    brandVoices,
    embeddingCounts,
  };
  return async (session, base, run) => {
    // Không có dữ liệu thật để thử → báo rõ, KHÔNG dùng kiến thức mẫu (FR-059, chủ dự án chốt 08/11: không mock khi chạy).
    const none = (): never => {
      throw new NoKnowledgeError();
    };
    if ((!options.enabled && !options.productsEnabled) || !session.userId) return none();
    const userId = session.userId;
    return options.db.withActor(session.workspaceId, userId, async (tx) => {
      // Phần TÌM kiến thức/sản phẩm dùng CHUNG với worker (`loadWorkspaceKnowledge`, `@flow/ai`); web chỉ chọn tham số.
      let resolution: EmbeddingResolution | undefined;
      let unreadable = false;
      if (options.resolveEmbedding) {
        try {
          resolution = await options.resolveEmbedding(tx);
        } catch (error) {
          unreadable = true; // không đoán model: suy giảm về toàn văn/trigram
          options.onEmbeddingFailure?.(error);
        }
      }
      const config = resolution?.config;
      const embedder = config?.kind === 'ml' ? config.embedder : undefined;
      const loaded = await loadWorkspaceKnowledge({
        tx,
        workspaceId: session.workspaceId,
        version: options.enabled ? await currentVersion(tx, session.workspaceId) : null,
        productsEnabled: options.productsEnabled === true,
        base,
        ...(embedder ? { embedder } : {}),
        ...(resolution?.revision != null ? { embeddingRevision: resolution.revision } : {}),
        ...(options.onEmbeddingFailure ? { onEmbeddingFailure: options.onEmbeddingFailure } : {}),
        readers,
      });
      if (!loaded) return none();
      return {
        value: await run(loaded.knowledge, loaded.context),
        source: loaded.source,
        embedding: loaded.embedding,
        vector: {
          off: unreadable ? 'unreadable' : config?.kind === 'off' ? config.reason : null,
          failed: loaded.vectorHealth.failed,
        },
      };
    });
  };
}
