import type { KbGapRecord, KbGapStatus, KbGapTopic, RetrievalLogRecord } from '@flow/shared';
import { RETRIEVAL_LOG_RETENTION_DAYS } from '@flow/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './client';
import { kbGaps, retrievalLogs } from './schema/cf/retrieval';

/**
 * RETRIEVAL-LOG (FR-134, migration 0040). Bản ghi đã dựng + che PII bằng `buildRetrievalLogRecord`/`buildKbGapRecord`
 * (`@flow/shared`); module này chỉ chạm DB, không tự che. Ghi chỉ hợp lệ trong `db.withJob(workspaceId, …)` trên kết nối
 * `cf_worker` (policy INSERT đòi ngữ cảnh hệ thống); đọc/đổi trạng thái đi qua `withActor`.
 */

/** Ghi một dòng nhật ký tìm kiếm; trả `id`. Ngữ cảnh khác job hệ thống của đúng workspace → lỗi 42501. */
export async function insertRetrievalLog(
  tx: Database,
  workspaceId: string,
  record: RetrievalLogRecord,
): Promise<string> {
  const [row] = await tx
    .insert(retrievalLogs)
    .values({
      workspaceId,
      draftId: record.draftId,
      commentId: record.commentId,
      queryMasked: record.queryMasked,
      lang: record.lang,
      kbVersion: record.kbVersion,
      route: record.route,
      searchQueryMasked: record.searchQueryMasked,
      candidates: record.candidates,
      usedChunkIds: record.usedChunkIds,
      resolvedProductIds: record.resolvedProductIds,
      latencyMs: record.latencyMs,
    })
    .returning({ id: retrievalLogs.id });
  if (!row) throw new Error('insert retrieval_logs không trả dòng nào');
  return row.id;
}

/** Nhật ký của một bản nháp (ô "Thử AI", FR-134), mới nhất trước. RLS giới hạn theo workspace hiện tại. */
export async function listRetrievalLogs(
  tx: Database,
  filter: { draftId: string; limit?: number },
): Promise<Array<typeof retrievalLogs.$inferSelect>> {
  return tx
    .select()
    .from(retrievalLogs)
    .where(eq(retrievalLogs.draftId, filter.draftId))
    .orderBy(desc(retrievalLogs.createdAt))
    .limit(filter.limit ?? 50);
}

export type RecordedKbGap = { id: string; count: number; status: KbGapStatus };

/**
 * Ghi một lần AI không trả lời được: gộp theo (workspace, chủ đề, sản phẩm) — lần đầu tạo `count = 1`, lần sau `count + 1`
 * (nguyên tử, an toàn khi nhiều worker đua nhau). Gap đã `resolved` mà khách lại hỏi → mở lại (`open`, bỏ nguồn đã gắn);
 * `ignored` giữ nguyên nhưng vẫn đếm. Chỉ trong `withJob` của đúng workspace.
 */
export async function recordKbGap(
  tx: Database,
  workspaceId: string,
  record: KbGapRecord,
): Promise<RecordedKbGap> {
  const result = await tx.execute<{ id: string; count: number; status: KbGapStatus }>(sql`
    INSERT INTO cf.kb_gaps AS g (workspace_id, topic, sample_question_masked, product_id)
    VALUES (${workspaceId}::uuid, ${record.topic}, ${record.sampleQuestionMasked}, ${record.productId}::uuid)
    ON CONFLICT (workspace_id, topic, (coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE SET
      count = g.count + 1,
      last_seen_at = now(),
      updated_at = now(),
      sample_question_masked = EXCLUDED.sample_question_masked,
      status = CASE WHEN g.status = 'resolved' THEN 'open' ELSE g.status END,
      resolved_by_source_id = CASE WHEN g.status = 'resolved' THEN NULL ELSE g.resolved_by_source_id END
    RETURNING g.id, g.count, g.status`);
  const row = result.rows[0];
  if (!row) throw new Error('upsert kb_gaps không trả dòng nào');
  return row;
}

export type KbGapFilter = {
  topic?: KbGapTopic;
  productId?: string;
  status?: KbGapStatus;
  limit?: number;
};

/** Danh sách gap (trang "Câu hỏi AI chưa trả lời được"): nhiều lần hỏi nhất trước. */
export async function listKbGaps(
  tx: Database,
  filter: KbGapFilter,
): Promise<Array<typeof kbGaps.$inferSelect>> {
  const conditions = [
    filter.topic ? eq(kbGaps.topic, filter.topic) : undefined,
    filter.productId ? eq(kbGaps.productId, filter.productId) : undefined,
    filter.status ? eq(kbGaps.status, filter.status) : undefined,
  ].filter((c) => c !== undefined);
  return tx
    .select()
    .from(kbGaps)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(kbGaps.count), desc(kbGaps.lastSeenAt))
    .limit(filter.limit ?? 100);
}

/**
 * Thành viên đổi trạng thái gap. `resolvedBySourceId` chỉ có nghĩa khi `resolved` (DB kiểm bằng CHECK + khóa ngoại cùng
 * workspace); trạng thái khác thì bỏ nguồn đã gắn. Id không thấy được (workspace khác, người ngoài) → 0 dòng đổi, trả `false`.
 */
export async function setKbGapStatus(
  tx: Database,
  id: string,
  status: KbGapStatus,
  resolvedBySourceId?: string,
): Promise<boolean> {
  const updated = await tx
    .update(kbGaps)
    .set({
      status,
      resolvedBySourceId: status === 'resolved' ? (resolvedBySourceId ?? null) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(kbGaps.id, id))
    .returning({ id: kbGaps.id });
  return updated.length > 0;
}

/**
 * Thẻ chính sách vừa được duyệt → đóng mọi gap ĐANG MỞ cùng chủ đề của workspace (cùng giao dịch với lần duyệt). Chỉ đổi `status`; trả số dòng đã đóng.
 * Gắn sản phẩm không liên quan (thẻ chính sách không theo sản phẩm). Chạy trong `withActor` của Owner (trigger `kb_gaps_guard_update` cho phép đổi trạng thái).
 */
export async function resolveOpenKbGapsByTopic(
  tx: Database,
  workspaceId: string,
  topic: KbGapTopic,
): Promise<number> {
  const updated = await tx
    .update(kbGaps)
    .set({ status: 'resolved', resolvedBySourceId: null, updatedAt: sql`now()` })
    .where(
      and(eq(kbGaps.workspaceId, workspaceId), eq(kbGaps.topic, topic), eq(kbGaps.status, 'open')),
    )
    .returning({ id: kbGaps.id });
  return updated.length;
}

/**
 * Như `resolveOpenKbGapsByTopic` nhưng chỉ đóng gap mở cùng chủ đề mà `matches(câu hỏi mẫu đã che PII)` đúng (khớp CHÍNH XÁC, M2b). Không có gap khớp → 0.
 */
export async function resolveOpenKbGapsMatching(
  tx: Database,
  workspaceId: string,
  topic: KbGapTopic,
  matches: (sampleQuestionMasked: string) => boolean,
): Promise<number> {
  const open = await tx
    .select({ id: kbGaps.id, sample: kbGaps.sampleQuestionMasked })
    .from(kbGaps)
    .where(
      and(eq(kbGaps.workspaceId, workspaceId), eq(kbGaps.topic, topic), eq(kbGaps.status, 'open')),
    );
  const ids = open.filter((row) => matches(row.sample)).map((row) => row.id);
  if (ids.length === 0) return 0;
  const updated = await tx
    .update(kbGaps)
    .set({ status: 'resolved', resolvedBySourceId: null, updatedAt: sql`now()` })
    .where(
      and(eq(kbGaps.workspaceId, workspaceId), inArray(kbGaps.id, ids), eq(kbGaps.status, 'open')),
    )
    .returning({ id: kbGaps.id });
  return updated.length;
}

/**
 * Dọn nhật ký cũ hơn `days` ngày (mặc định 90, FR-134); trả số dòng đã xóa (tối đa 20000/lần). CHỈ gọi trong
 * `db.withSystem(...)` (ngữ cảnh trần): hàm DEFINER từ chối ngữ cảnh khác; `days` < 30 bị từ chối (CF422).
 */
export async function purgeExpiredRetrievalLogs(
  tx: Database,
  days: number = RETRIEVAL_LOG_RETENTION_DAYS,
): Promise<number> {
  const result = await tx.execute<{ purged: number }>(
    sql`SELECT cf.purge_expired_retrieval_logs(${days}::integer) AS purged`,
  );
  return result.rows[0]?.purged ?? 0;
}
