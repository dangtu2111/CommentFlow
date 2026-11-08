// CLI đổi model embedding (FR-133, Q-EMB-1). Dùng role `cf_worker` (DATABASE_WORKER_URL), KHÔNG dùng khóa admin:
//   pnpm --filter @flow/worker kb:switch-embedding -- <model>      tạo vector mới cho TOÀN BỘ dữ liệu, đủ 100% mới đổi (một giao dịch)
//   pnpm --filter @flow/worker kb:switch-embedding -- --status     in model đang hoạt động / đang chuyển
// Dịch vụ ml (ML_EMBED_ENABLED=true + ML_URL) phải đang chạy đúng model đích. Model KHÔNG lấy từ env: truyền vào lệnh. Lần đầu dùng để kích hoạt bge-m3.
// Không in nội dung kiến thức, khóa hay chuỗi kết nối.
import { createMlEmbedder } from '@flow/ai';
import { createDb, getEmbeddingState } from '@flow/db';
import { isAppError } from '@flow/shared';
import { loadConfig } from '../config';
import { runEmbeddingSwitch } from '../embedding-switch';
import { parseSwitchArgs } from './kb-switch-embedding-args';

const logger = {
  info: (fields: object, message: string) => console.log(`${message} ${JSON.stringify(fields)}`),
  warn: (fields: object, message: string) => console.warn(`${message} ${JSON.stringify(fields)}`),
  error: (fields: object, message: string) => console.error(`${message} ${JSON.stringify(fields)}`),
};

try {
  const command = parseSwitchArgs(process.argv.slice(2));
  const config = loadConfig();
  const db = createDb({ connectionString: config.databaseUrl, max: 4 });
  try {
    if (command.action === 'status') {
      const state = await db.withSystem((tx) => getEmbeddingState(tx));
      console.log(`Model đang hoạt động: ${state.activeModel ?? '(chưa kích hoạt)'}`);
      console.log(
        `Đang chuyển sang: ${state.pendingModel ?? '(không)'} · revision ${state.revision}`,
      );
    } else {
      if (!config.embeddingService) {
        throw new Error(
          'Chưa bật dịch vụ ml: sửa .env.local (ML_EMBED_ENABLED=true + ML_URL) rồi chạy lại; KHÔNG đổi cờ chỉ cho riêng lệnh này.',
        );
      }
      const embedder = createMlEmbedder({
        ...config.embeddingService,
        expectedModel: command.model,
      });
      const result = await runEmbeddingSwitch({ db, embedder, model: command.model, logger });
      console.log(
        result.status === 'already_active'
          ? `Model "${result.model}" đã hoạt động.`
          : `Đã chuyển sang "${result.model}" (revision ${result.revision}); đã tạo ${result.staged.chunks} vector đoạn + ${result.staged.products} vector sản phẩm.`,
      );
    }
  } finally {
    await db.close();
  }
} catch (error) {
  // Drizzle bọc lỗi DB thành "Failed query" kèm tham số (vector rất dài): in NGUYÊN NHÂN thật (cause) và cắt phần tham số.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
  const message = isAppError(error)
    ? `[${error.code}] ${error.message}`
    : error instanceof Error
      ? (error.message.split('\nparams:')[0] ?? error.message)
      : 'Thất bại.';
  console.error(cause ? `${message}\nNguyên nhân: ${cause}` : message);
  process.exit(1);
}
