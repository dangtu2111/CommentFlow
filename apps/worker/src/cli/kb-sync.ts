// Lệnh DEV: đồng bộ nguồn nhập tay (thông tin shop, chính sách, FAQ, sản phẩm) vào BẢN NHÁP kiến thức của MỘT workspace, rồi in báo cáo.
//   pnpm --filter @flow/worker kb:sync -- <workspace-uuid>
// Dùng role `cf_worker` (DATABASE_WORKER_URL). Cần dịch vụ ml đang chạy + model embedding đã kích hoạt ở DB (kb:switch-embedding); thiếu → lỗi rõ.
// Chỉ ghi bản nháp (KHÔNG xuất bản). Staging/production: dùng nút "Đồng bộ kiến thức" ở trang Xuất bản, không chạy lệnh này.
// Không in nội dung kiến thức, khóa hay chuỗi kết nối.
import { conflictChunkOf, createEmbeddingResolver, detectConflicts } from '@flow/ai';
import { createDb, getEmbeddingState, listDraftChunkTexts, summarizeDraftChunks } from '@flow/db';
import { isAppError } from '@flow/shared';
import { loadConfig } from '../config';
import { runKbSync } from '../jobs/kb-sync';

try {
  const workspaceId = process.argv.slice(2).find((arg) => /^[0-9a-f-]{36}$/i.test(arg));
  if (!workspaceId)
    throw new Error('Cách dùng: pnpm --filter @flow/worker kb:sync -- <workspace-uuid>');
  const appEnv = (process.env.APP_ENV ?? '').trim();
  if (appEnv === 'staging' || appEnv === 'production') {
    throw new Error(
      'Không chạy lệnh này ở staging/production: dùng nút "Đồng bộ kiến thức" ở trang Xuất bản.',
    );
  }
  const config = loadConfig();
  const db = createDb({ connectionString: config.databaseUrl, max: 4 });
  try {
    const resolver = createEmbeddingResolver({ service: config.embeddingService });
    const stats = await db.withJob(workspaceId, (tx) =>
      runKbSync(
        tx,
        { workspaceId },
        {
          resolveEmbedding: async (t) =>
            (await resolver.resolve(() => getEmbeddingState(t))).config,
        },
      ),
    );
    const state = await db.withSystem((tx) => getEmbeddingState(tx));
    const model = state.activeModel ?? '';
    const summary = await db.withJob(workspaceId, (tx) =>
      summarizeDraftChunks(tx, workspaceId, model),
    );
    const texts = await db.withJob(workspaceId, (tx) => listDraftChunkTexts(tx, workspaceId));
    const conflicts = detectConflicts(texts.map(conflictChunkOf));
    console.log(
      `Đồng bộ xong: ${stats.sources} nguồn, ghi ${stats.chunksWritten} đoạn, giữ ${stats.chunksUnchanged}, xóa ${stats.chunksRemoved}.`,
    );
    console.log(`Model embedding hoạt động: ${model || '(chưa kích hoạt)'}`);
    for (const row of summary) {
      console.log(`  ${row.source}: ${row.chunks} đoạn nháp, ${row.withVector} có vector ${model}`);
    }
    if (stats.productsTruncated)
      console.log('Cảnh báo: sản phẩm vượt giới hạn, phần còn lại chưa vào bản nháp.');
    if (conflicts.length === 0) console.log('Mâu thuẫn chính sách: không có.');
    for (const group of conflicts) {
      console.log(`Mâu thuẫn [${group.topic}] giá trị: ${group.values.join(' / ')}`);
      for (const m of group.members) console.log(`  - "${m.sentence}" (${m.sourceTitle})`);
    }
  } finally {
    await db.close();
  }
} catch (error) {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
  const message = isAppError(error)
    ? `[${error.code}] ${error.message}`
    : error instanceof Error
      ? (error.message.split('\nparams:')[0] ?? error.message)
      : 'Thất bại.';
  console.error(cause ? `${message}\nNguyên nhân: ${cause}` : message);
  process.exit(1);
}
