import { computeReadiness, type ReadinessLang, type ReadinessResult } from '@flow/ai';
import { loadReadinessSource } from '@flow/db/runtime';
import { getDb } from './db';

/**
 * Độ sẵn sàng của AI (FR-146) cho workspace đang chọn: đọc số liệu trong MỘT giao dịch `withActor` (RLS: chỉ thành
 * viên đang hoạt động) rồi tính bằng hàm thuần `computeReadiness`. `workspaceId`/`userId` lấy từ `requireAppUser`.
 */
export async function loadReadiness(
  workspaceId: string,
  userId: string,
  lang: ReadinessLang,
): Promise<ReadinessResult> {
  const source = await getDb().withActor(workspaceId, userId, (tx) =>
    loadReadinessSource(tx, workspaceId),
  );
  return computeReadiness({ lang, ...source });
}

/** Ngôn ngữ giao diện → ngôn ngữ đo (mặc định `vi`). */
export function readinessLangOf(locale: string): ReadinessLang {
  return locale === 'en' ? 'en' : 'vi';
}
