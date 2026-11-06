import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Số phiên bản kiến thức đã xuất bản mới nhất của workspace (`kb_versions.number`; 0 khi chưa xuất bản).
 * Là phần `kb_version` trong khóa cache khớp chính xác (FR-026): xuất bản bản mới → khóa đổi → cache cũ không còn được tra.
 * Lọc `workspace_id` rõ ràng; gọi trong `withWorkspace`/`withActor`/`withJob` (RLS vẫn áp dụng).
 */
export async function getCurrentKbVersion(tx: Database, workspaceId: string): Promise<number> {
  const result = await tx.execute<{ number: number | null }>(sql`
    SELECT max(v.number) AS number FROM cf.kb_versions v WHERE v.workspace_id = ${workspaceId}::uuid`);
  return Number(result.rows[0]?.number ?? 0);
}
