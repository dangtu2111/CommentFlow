import { type KbTestCaseRow, listKbTestCases } from '@flow/db/runtime';
import { getDb } from './db';

/** Bộ câu kiểm thử đã lưu của workspace đang chọn (migration 0096). RLS: chỉ Owner đọc được. Danh tính lấy từ `requireAppUser`. */
export function loadKbTestCases(workspaceId: string, userId: string): Promise<KbTestCaseRow[]> {
  return getDb().withActor(workspaceId, userId, (tx) => listKbTestCases(tx, workspaceId));
}
