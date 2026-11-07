import {
  createDbKbSearcher,
  createDbProductKnowledge,
  createDbShopKnowledgeSearch,
  createFixtureEmbedder,
  createKbTryKnowledge,
  type Embedder,
  type TryKnowledge,
} from '@flow/ai';
import {
  countActiveProducts,
  type Database,
  getCurrentVersion,
  type KbVersionRef,
  listTryProductNames,
  loadAbbreviationEntries,
  loadTryShopTexts,
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
export type TryKnowledgeSource = 'demo' | 'shop' | 'kb';
export type TrySession = { workspaceId: string; userId?: string };

/** Thông tin thêm cho bộ nhận diện: tên sản phẩm thật để nhận ra khách đang nhắc sản phẩm nào. */
export type TryRunContext = {
  productNames: readonly string[];
  /** Từ điển viết tắt (hệ thống + workspace) để mở "bn", "sz"… trước khi extract/tìm kiếm; rỗng → dùng bản mẫu. */
  abbreviations: Readonly<Record<string, string>>;
};

export type KnowledgeRunner = <T>(
  session: TrySession,
  base: TryKnowledge,
  run: (knowledge: TryKnowledge, context: TryRunContext) => Promise<T>,
) => Promise<{ value: T; source: TryKnowledgeSource }>;

export const isTryAiKbReal = (env: Record<string, string | undefined>): boolean =>
  env.TRY_AI_KB_REAL === 'true';

/** Mặc định BẬT (chỉ đọc dữ liệu của chính workspace, không tốn tiền, không gọi ngoài); tắt bằng đúng chữ `false`. */
export const isTryAiProductsReal = (env: Record<string, string | undefined>): boolean =>
  env.TRY_AI_PRODUCTS_REAL !== 'false';

/** Nhãn dữ liệu mẫu của DEV (`pnpm dev:seed-demo`): không bao giờ tính là sản phẩm thật. */
const SAMPLE_LABEL = '[MẪU]';

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
  /** Embedding thật (bge-m3 qua `ml`) khi bật `ML_EMBED_ENABLED`; mặc định bản fixture. */
  embedder?: Embedder;
}): KnowledgeRunner {
  const currentVersion = options.currentVersion ?? getCurrentVersion;
  const countProducts =
    options.countProducts ?? ((tx, ws) => countActiveProducts(tx, ws, SAMPLE_LABEL));
  const productNames =
    options.productNames ?? ((tx, ws) => listTryProductNames(tx, ws, SAMPLE_LABEL));
  const shopTexts = options.shopTexts ?? ((tx, ws) => loadTryShopTexts(tx, ws, SAMPLE_LABEL));
  const abbreviations =
    options.abbreviations ??
    (async (tx: Database, ws: string) => ({
      ...(await loadAbbreviationEntries(tx, ws, 'en')),
      ...(await loadAbbreviationEntries(tx, ws, 'vi')),
    }));
  return async (session, base, run) => {
    const demo = async () => ({
      value: await run(base, { productNames: [], abbreviations: {} }),
      source: 'demo' as const,
    });
    if ((!options.enabled && !options.productsEnabled) || !session.userId) return demo();
    const userId = session.userId;
    return options.db.withActor(session.workspaceId, userId, async (tx) => {
      const hasProducts = options.productsEnabled
        ? (await countProducts(tx, session.workspaceId)) > 0
        : false;
      const version = options.enabled ? await currentVersion(tx, session.workspaceId) : null;
      const texts = options.productsEnabled ? await shopTexts(tx, session.workspaceId) : [];
      const hasShopData = hasProducts || texts.length > 0;
      if (!version && !hasShopData) return demo();
      const products = hasProducts ? createDbProductKnowledge(tx, session.workspaceId) : base;
      const names = hasProducts ? await productNames(tx, session.workspaceId) : [];
      const abbreviationEntries = await abbreviations(tx, session.workspaceId);
      if (!version) {
        const knowledge: TryKnowledge = {
          ...products,
          searchKb: createDbShopKnowledgeSearch(texts),
        };
        return {
          value: await run(knowledge, { productNames: names, abbreviations: abbreviationEntries }),
          source: 'shop' as const,
        };
      }
      const knowledge = createKbTryKnowledge({
        searcher: createDbKbSearcher(tx, {
          workspaceId: session.workspaceId,
          versionId: version.id,
        }),
        embedder: options.embedder ?? createFixtureEmbedder(),
        base: products,
      });
      return {
        value: await run(knowledge, { productNames: names, abbreviations: abbreviationEntries }),
        source: 'kb' as const,
      };
    });
  };
}
