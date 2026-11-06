import { z } from 'zod';

/** Trạng thái một câu AI đã tự gửi (FR-075): `marked_wrong` = nhân viên bấm Đánh dấu sai. */
export const AUTO_SENT_STATUSES = ['sent', 'marked_wrong'] as const;

/** Vai trò được Đánh dấu sai: Owner và Staff (docs/13 §3). */
export const MARK_WRONG_ROLES = ['owner', 'staff'] as const;
export type MarkWrongRole = (typeof MARK_WRONG_ROLES)[number];

/**
 * Một câu AI đã tự gửi. Là hình dạng phía ứng dụng; bản DB (`drafts.status = auto_sent` + `automation_events`)
 * sẽ ánh xạ vào đây khi có migration (gap matrix `AI-SENT-HISTORY-DB`). `text` là câu AI soạn, không phải nội
 * dung khách.
 */
export const AutoSentRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
  targetType: z.enum(['comment', 'message']),
  targetId: z.string().min(1),
  text: z.string().min(1),
  lang: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sentAt: z.date(),
  status: z.enum(AUTO_SENT_STATUSES),
  markedWrongAt: z.date().nullable(),
  markedWrongBy: z.string().nullable(),
  wrongReason: z.string().nullable(),
});
export type AutoSentRecord = z.infer<typeof AutoSentRecordSchema>;
