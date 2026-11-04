import { createDb, type FlowDb } from '@flow/db/runtime';
import { loadWebhookEnv } from './env';

/**
 * Một `FlowDb` (role cf_app, DATABASE_URL) dùng chung cho phần web truy vấn dữ liệu sản phẩm. Khởi tạo lười, một bản
 * duy nhất cho mỗi tiến trình. Mọi truy vấn nghiệp vụ PHẢI đi qua `withActor(workspace.id, user.id, …)` với id lấy từ
 * `requireAppUser` — không bao giờ từ client (nguyên tắc #2).
 */
const holder = globalThis as typeof globalThis & { __cfWebDb?: FlowDb };

export function getDb(): FlowDb {
  holder.__cfWebDb ??= createDb({ connectionString: loadWebhookEnv().databaseUrl, max: 5 });
  return holder.__cfWebDb;
}
