import {
  type AutoPauseConfig,
  type AutoPauseDecision,
  evaluateAutoPause,
  type SendOutcome,
} from '../autopause/auto-pause';
import type { AutoSentRecord } from '../history/auto-sent-record';
import { type BannedKeywordHit, type ScanItem, scanBannedKeywords } from './banned-keywords';

/**
 * Phát hiện lạm dụng (job `abuse`, FR-115, `docs/09` §11.2, Q-ABJ1). Hàm THUẦN: nhận số liệu đã gom + đồng hồ, trả
 * quyết định; việc đọc số liệu/ghi hiệu ứng do job (`apps/worker/src/jobs/abuse.ts`) qua `AbuseSink`.
 *
 * AI KHÔNG BAO GIỜ tự ẩn bình luận: kiểu `AbuseDecision` không có hành động ẩn nào — hành động nặng nhất là dừng
 * tự gửi / khóa kênh / chặn tự gửi + hàng xem xét của Admin.
 */

export const REMOVED_AFTER_SEND_MIN_SENT = 10;

export type AbuseSignalName =
  | 'marked_wrong_rate'
  | 'removed_after_send'
  | 'graph_368'
  | 'volume_spike'
  | 'banned_keyword';
export type AbuseSignal = { signal: AbuseSignalName; channelId: string | null };
export type AbuseWarning = 'send_spike' | 'removed_after_send';

export type ScopedSendOutcome = SendOutcome & { workspaceId: string };

export type AbuseInput = {
  workspaceId: string;
  records: readonly AutoSentRecord[];
  sendOutcomes: readonly ScopedSendOutcome[];
  cost: { spentUsd: number; capUsd: number | null };
  spike: { lastHourSent: number; avgHourlySent7d: number };
  /** Trong 24 giờ: số câu đã gửi và số câu bị Page/người dùng xóa hoặc ẩn sau khi gửi. */
  removedAfterSend: { sent: number; removed: number };
  /** Câu gửi + mục kiến thức cần quét từ khóa cấm. */
  scanItems: readonly ScanItem[];
  bannedKeywords?: readonly string[];
  config?: AutoPauseConfig;
};

export type AbuseDecision = {
  autoPause: AutoPauseDecision;
  warnAdmin: AbuseWarning[];
  /** Có khớp từ khóa cấm → chặn tự gửi và đưa vào hàng xem xét của Admin. */
  blockAutoSend: boolean;
  reviewItems: BannedKeywordHit[];
  signals: AbuseSignal[];
};

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** > 20% trong 24 giờ (≥ 10 câu). So số nguyên (removed*5 > sent); số liệu hỏng → KHÔNG cảnh báo giả. */
export function evaluateRemovedAfterSend({ sent, removed }: AbuseInput['removedAfterSend']) {
  const valid = isCount(sent) && isCount(removed) && removed <= sent;
  const warn = valid && sent >= REMOVED_AFTER_SEND_MIN_SENT && removed * 5 > sent;
  return { warn, sent, removed };
}

export function evaluateAbuse(input: AbuseInput, now: Date): AbuseDecision {
  // Chỉ số liệu của ĐÚNG workspace (đầu vào của job có thể lẫn).
  const records = input.records.filter((r) => r.workspaceId === input.workspaceId);
  const sendOutcomes = input.sendOutcomes.filter((o) => o.workspaceId === input.workspaceId);
  const autoPause = evaluateAutoPause(
    {
      records,
      sendOutcomes,
      cost: input.cost,
      spike: input.spike,
      ...(input.config ? { config: input.config } : {}),
    },
    now,
  );
  const removed = evaluateRemovedAfterSend(input.removedAfterSend);
  const reviewItems = scanBannedKeywords(input.scanItems, input.bannedKeywords);

  const warnAdmin: AbuseWarning[] = [...autoPause.warnAdmin];
  if (removed.warn) warnAdmin.push('removed_after_send');

  const signals: AbuseSignal[] = [];
  if (autoPause.pauseWorkspace?.reasons.includes('marked_wrong_rate')) {
    signals.push({ signal: 'marked_wrong_rate', channelId: null });
  }
  if (removed.warn) signals.push({ signal: 'removed_after_send', channelId: null });
  for (const c of autoPause.suspendChannels) {
    signals.push({ signal: 'graph_368', channelId: c.channelId });
  }
  if (autoPause.warnAdmin.includes('send_spike')) {
    signals.push({ signal: 'volume_spike', channelId: null });
  }
  if (reviewItems.length > 0) signals.push({ signal: 'banned_keyword', channelId: null });

  return { autoPause, warnAdmin, blockAutoSend: reviewItems.length > 0, reviewItems, signals };
}
