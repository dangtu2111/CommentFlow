import { type Embedder, reembedWorkspaceChunks, reembedWorkspaceProducts } from '@flow/ai';
import {
  beginEmbeddingSwitch,
  type FlowDb,
  getEmbeddingState,
  listChunksForSwitch,
  listEmbeddingSwitchPending,
  listProductsForSwitch,
  switchActiveEmbedding,
  writeChunksNext,
  writeProductsNext,
} from '@flow/db';
import { AppError } from '@flow/shared';

/**
 * ĐỔI MODEL EMBEDDING (`kb:switch-embedding <model>`, FR-133, Q-EMB-1): tạo vector mới vào CỘT ĐỆM cho TOÀN BỘ dữ liệu (mọi workspace: đoạn kiến thức
 * nháp + đã xuất bản, tên sản phẩm) trong khi truy vấn vẫn dùng model cũ; đủ 100% mới gọi `cf.switch_active_embedding` — MỘT giao dịch (bảng khóa ghi):
 * đổi `active_model` rồi chuyển cột đệm → cột chính. Ngắt/lỗi giữa chừng → model cũ giữ nguyên; chạy lại tiếp tục từ chỗ dở (vector đệm đã tạo được giữ).
 * Dịch vụ ml phải đang chạy đúng model đích (embedder tự từ chối nếu dịch vụ trả model khác). Không log nội dung kiến thức.
 */
/** Ghi log tối thiểu (pino hoặc console đều dùng được); không kèm nội dung kiến thức. */
export type SwitchLogger = Record<
  'info' | 'warn' | 'error',
  (fields: object, message: string) => void
>;

const PENDING_PAGE = 200;
const DEFAULT_MAX_PASSES = 50;
const SWITCH_RETRIES = 3;

export type EmbeddingSwitchResult =
  | { status: 'already_active'; model: string }
  | {
      status: 'switched';
      model: string;
      revision: number;
      staged: { chunks: number; products: number };
    };

export async function runEmbeddingSwitch(deps: {
  db: FlowDb;
  /** Embedder của model ĐÍCH (`createMlEmbedder({ …, expectedModel: model })`). */
  embedder: Embedder;
  model: string;
  logger: SwitchLogger;
  batchSize?: number;
  maxPasses?: number;
}): Promise<EmbeddingSwitchResult> {
  const { db, embedder, model, logger } = deps;
  if (embedder.model !== model) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Embedder là "${embedder.model}", không phải model đích "${model}" — dừng, chưa đụng dữ liệu.`,
    );
  }
  const before = await db.withSystem((tx) => getEmbeddingState(tx));
  if (before.activeModel === model && before.pendingModel === null) {
    logger.info({ model }, 'model đã hoạt động — không cần chuyển');
    return { status: 'already_active', model };
  }
  await db.withSystem((tx) => beginEmbeddingSwitch(tx, model));
  logger.info(
    { from: before.activeModel, to: model },
    'bắt đầu tạo vector mới (truy vấn vẫn dùng model cũ)',
  );

  const staged = { chunks: 0, products: 0 };
  const maxPasses = deps.maxPasses ?? DEFAULT_MAX_PASSES;
  const batch = deps.batchSize ? { batchSize: deps.batchSize } : {};
  /** Tạo vector đệm cho MỌI dòng còn thiếu của một workspace (đoạn kiến thức rồi sản phẩm); trả số vector đã ghi. */
  const stageWorkspace = (workspaceId: string): Promise<number> =>
    db.withJob(workspaceId, async (tx) => {
      const chunks = await reembedWorkspaceChunks({
        embedder,
        ...batch,
        ops: {
          list: (m, limit) => listChunksForSwitch(tx, workspaceId, m, limit),
          write: (m, rows) => writeChunksNext(tx, workspaceId, m, rows),
        },
      });
      const products = await reembedWorkspaceProducts({
        embedder,
        ...batch,
        ops: {
          list: (m, limit) => listProductsForSwitch(tx, workspaceId, m, limit),
          write: (m, rows) => writeProductsNext(tx, workspaceId, m, rows),
        },
      });
      staged.chunks += chunks.reembedded;
      staged.products += products.reembedded;
      return chunks.reembedded + products.reembedded;
    });
  for (let pass = 1; pass <= maxPasses; pass++) {
    const pending = await db.withSystem((tx) =>
      listEmbeddingSwitchPending(tx, model, PENDING_PAGE),
    );
    if (pending.length === 0) break;
    let progressed = 0;
    for (const item of pending) {
      progressed += await stageWorkspace(item.workspaceId);
      logger.info(
        { workspaceId: item.workspaceId, chunks: item.chunks, products: item.products },
        'đã tạo vector mới cho workspace',
      );
    }
    if (progressed === 0) {
      throw new AppError(
        'INTERNAL',
        `Không tạo thêm được vector nào dù còn ${pending.length} workspace chưa đủ — dừng, giữ model cũ "${before.activeModel ?? '(chưa có)'}".`,
      );
    }
  }

  // Đủ 100% mới chuyển; dòng mới chen vào lúc đang chuyển → hàm từ chối (giữ model cũ) → tạo bù rồi thử lại vài lần.
  let lastError: unknown;
  for (let attempt = 1; attempt <= SWITCH_RETRIES; attempt++) {
    const state = await db.withSystem((tx) => getEmbeddingState(tx));
    try {
      const revision = await db.withSystem((tx) =>
        switchActiveEmbedding(tx, model, state.revision),
      );
      logger.info({ model, revision }, 'đã chuyển model hoạt động');
      return { status: 'switched', model, revision, staged };
    } catch (error) {
      lastError = error;
      logger.warn(
        { attempt },
        'chưa chuyển được (còn dòng chưa có vector mới) — tạo bù rồi thử lại',
      );
      const pending = await db.withSystem((tx) =>
        listEmbeddingSwitchPending(tx, model, PENDING_PAGE),
      );
      for (const item of pending) await stageWorkspace(item.workspaceId);
    }
  }
  throw new AppError(
    'INTERNAL',
    `Không chuyển được sang "${model}" sau ${SWITCH_RETRIES} lần — model cũ vẫn hoạt động. Lỗi cuối: ${lastError instanceof Error ? lastError.message : 'không rõ'}`,
  );
}
