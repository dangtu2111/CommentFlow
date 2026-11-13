import {
  cancelPublishSchedule,
  deletePublishPost,
  getPublishPost,
  publishPostNow,
  savePublishPost,
  updatePublishPost,
} from '@flow/db/runtime';
import { getDb } from './db';
import { createPublishPostService } from './publish-posts';

/**
 * Cờ `FB_PUBLISH_ENABLED` (web) — MẶC ĐỊNH TẮT, chỉ đúng chữ `true` mới bật (cùng tên với cờ của worker; hai bên phải cùng bật thì bài mới được đăng thật).
 * Tắt: Owner vẫn soạn và lưu NHÁP được, nhưng "Lên lịch"/"Đăng ngay" bị từ chối kèm lý do rõ ràng.
 */
export function publishEnabled(): boolean {
  return process.env.FB_PUBLISH_ENABLED?.trim() === 'true';
}

/**
 * Dịch vụ bài đăng nối DB thật. Mọi ghi đi qua `withActor` (hàm DEFINER tự kiểm Owner đang hoạt động — migration 0090). Nơi gọi PHẢI đã gọi
 * `requireAppUser({ role: 'owner' })` và truyền `workspaceId`/`userId` từ đó (không từ client).
 */
export function publishPostService() {
  const db = getDb();
  return createPublishPostService({
    publishEnabled,
    save: (session, input) =>
      db.withActor(session.workspaceId, session.userId, (tx) => savePublishPost(tx, input)),
    publishNow: (session, id) =>
      db.withActor(session.workspaceId, session.userId, (tx) => publishPostNow(tx, id)),
    cancelSchedule: (session, id) =>
      db.withActor(session.workspaceId, session.userId, (tx) => cancelPublishSchedule(tx, id)),
    remove: (session, id) =>
      db.withActor(session.workspaceId, session.userId, (tx) => deletePublishPost(tx, id)),
    get: (session, id) =>
      db.withActor(session.workspaceId, session.userId, (tx) =>
        getPublishPost(tx, session.workspaceId, id),
      ),
    update: (session, input) =>
      db.withActor(session.workspaceId, session.userId, (tx) => updatePublishPost(tx, input)),
    warn: (event) => console.error(JSON.stringify(event)),
  });
}
