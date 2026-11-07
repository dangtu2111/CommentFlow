// CLI tạo lại embedding (FR-133). Dùng role `cf_worker` (DATABASE_WORKER_URL), KHÔNG dùng khóa admin:
//   pnpm --filter @flow/worker kb:reembed -- count <workspaceId>     in số đoạn theo mô hình + số đoạn còn cần tạo lại
//   pnpm --filter @flow/worker kb:reembed -- enqueue <workspaceId>   đưa job vào hàng đợi (worker đang chạy xử lý)
// Mô hình đích = mô hình của embedder đang cấu hình (ML_EMBED_ENABLED=true + ML_URL → bge-m3; không → mock).
// Không in nội dung kiến thức, khóa hay chuỗi kết nối.
import { countChunksByEmbeddingModel, countChunksToReembed, createDb } from '@flow/db';
import { isAppError, KB_REEMBED_QUEUE } from '@flow/shared';
import { loadConfig } from '../config';
import { pickReembedEmbedder } from '../jobs/kb-reembed-embedder';
import { createBoss } from '../queue/boss';
import { parseReembedArgs } from './kb-reembed-args';

try {
  const command = parseReembedArgs(process.argv.slice(2));
  const config = loadConfig();
  const target = pickReembedEmbedder(config).model;
  console.log(
    `Mô hình đích: ${target} (${config.mlEmbedder ? 'dịch vụ ml' : 'MOCK — chưa bật ML_EMBED_ENABLED'})`,
  );

  if (command.action === 'count') {
    const db = createDb({ connectionString: config.databaseUrl, max: 2 });
    try {
      const [byModel, pending] = await Promise.all([
        db.withJob(command.workspaceId, (tx) =>
          countChunksByEmbeddingModel(tx, command.workspaceId),
        ),
        db.withJob(command.workspaceId, (tx) =>
          countChunksToReembed(tx, command.workspaceId, target),
        ),
      ]);
      console.log('Số đoạn theo mô hình embedding:');
      for (const row of byModel)
        console.log(`  ${row.model === '' ? '(chưa có)' : row.model}: ${row.count}`);
      console.log(`Còn cần tạo lại cho ${target}: ${pending}`);
    } finally {
      await db.close();
    }
  } else {
    const boss = createBoss(config.databaseUrl, { error: () => {} });
    await boss.start();
    try {
      await boss.send(KB_REEMBED_QUEUE, { workspaceId: command.workspaceId });
      console.log(
        `Đã đưa job ${KB_REEMBED_QUEUE} vào hàng đợi. Worker phải đang chạy với KB_REEMBED_ENABLED=true.`,
      );
    } finally {
      await boss.stop();
    }
  }
} catch (error) {
  console.error(
    isAppError(error)
      ? `[${error.code}] ${error.message}`
      : error instanceof Error
        ? error.message
        : 'Thất bại.',
  );
  process.exit(1);
}
