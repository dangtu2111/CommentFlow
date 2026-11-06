import {
  createDbKbSearcher,
  createFixtureEmbedder,
  createKbTryKnowledge,
  type TryKnowledge,
} from '@flow/ai';
import { type Database, getCurrentVersion, type KbVersionRef } from '@flow/db/runtime';

/**
 * Nguồn kiến thức của ô Thử AI (KB-TRYAI, FR-059). Cờ `TRY_AI_KB_REAL` mặc định TẮT → kiến thức mẫu như cũ.
 * Bật: tìm trong phiên bản kiến thức đã xuất bản MỚI NHẤT của workspace (`searchKbChunks`) trong một giao dịch
 * `withActor` (RLS). Embedding vẫn là bản fixture (Xong-mock); sản phẩm vẫn từ bản nền (`TRY-AI-REAL`).
 */
export type TryKnowledgeSource = 'demo' | 'kb';
export type TrySession = { workspaceId: string; userId?: string };

export type KnowledgeRunner = <T>(
  session: TrySession,
  base: TryKnowledge,
  run: (knowledge: TryKnowledge) => Promise<T>,
) => Promise<{ value: T; source: TryKnowledgeSource }>;

export const isTryAiKbReal = (env: Record<string, string | undefined>): boolean =>
  env.TRY_AI_KB_REAL === 'true';

type ActorDb = {
  withActor<T>(workspaceId: string, userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
};

export function createKnowledgeRunner(options: {
  enabled: boolean;
  db: ActorDb;
  /** Tiêm được để test; mặc định đọc `kb_versions`. */
  currentVersion?: (tx: Database, workspaceId: string) => Promise<KbVersionRef | null>;
}): KnowledgeRunner {
  const currentVersion = options.currentVersion ?? getCurrentVersion;
  return async (session, base, run) => {
    const demo = async () => ({ value: await run(base), source: 'demo' as const });
    if (!options.enabled || !session.userId) return demo();
    const userId = session.userId;
    return options.db.withActor(session.workspaceId, userId, async (tx) => {
      const version = await currentVersion(tx, session.workspaceId);
      if (!version) return demo();
      const knowledge = createKbTryKnowledge({
        searcher: createDbKbSearcher(tx, {
          workspaceId: session.workspaceId,
          versionId: version.id,
        }),
        embedder: createFixtureEmbedder(),
        base,
      });
      return { value: await run(knowledge), source: 'kb' as const };
    });
  };
}
