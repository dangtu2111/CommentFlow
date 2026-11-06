import type { AutoPauseReason, ChannelBlockError } from '../autopause/auto-pause';
import type { AbuseSignal, AbuseWarning } from './abuse-signals';
import type { BannedKeywordHit } from './banned-keywords';

export type ChannelSuspension = { channelId: string; reason: ChannelBlockError; until: Date };

/** Thông báo cho Owner/Admin (kênh gửi — banner/email — do nơi cài đặt thật quyết định). */
export type AbuseNotification =
  | { kind: 'workspace_paused'; reason: AutoPauseReason }
  | { kind: 'channel_suspended'; channelId: string; reason: ChannelBlockError }
  | { kind: 'admin_warning'; warning: AbuseWarning };

export type AbuseReview = { blockAutoSend: boolean; items: BannedKeywordHit[] };

/**
 * Nơi job `abuse` ghi hiệu ứng. Interface vì có 2 nơi dùng thật: bản bộ nhớ (test/fixture) và bản DB
 * (`abuse_signals`, `channels.send_suspended_*`, hàng xem xét — chờ migration làn b, gap `ABUSE-JOB-WIRE`).
 * Mọi phương thức phải idempotent: job chạy lại (thử lại) không nhân đôi hiệu ứng.
 */
export interface AbuseSink {
  recordSignals(workspaceId: string, signals: readonly AbuseSignal[]): Promise<void>;
  /** Trả danh sách kênh MỚI bị khóa (để chỉ thông báo một lần). */
  suspendChannels(
    workspaceId: string,
    suspensions: readonly ChannelSuspension[],
  ): Promise<string[]>;
  enqueueReview(workspaceId: string, review: AbuseReview): Promise<void>;
  notify(workspaceId: string, notification: AbuseNotification): Promise<void>;
}

export type InMemoryAbuseSink = AbuseSink & {
  readonly signals: { workspaceId: string; signal: AbuseSignal }[];
  readonly reviews: { workspaceId: string; review: AbuseReview }[];
  readonly notifications: { workspaceId: string; notification: AbuseNotification }[];
};

export function createInMemoryAbuseSink(): InMemoryAbuseSink {
  const signals: InMemoryAbuseSink['signals'] = [];
  const reviews: InMemoryAbuseSink['reviews'] = [];
  const notifications: InMemoryAbuseSink['notifications'] = [];
  const suspended = new Map<string, number>();
  return {
    signals,
    reviews,
    notifications,
    async recordSignals(workspaceId, list) {
      for (const signal of list) signals.push({ workspaceId, signal });
    },
    async suspendChannels(workspaceId, list) {
      const fresh: string[] = [];
      for (const s of list) {
        const key = `${workspaceId}:${s.channelId}`;
        if (suspended.get(key) === s.until.getTime()) continue;
        suspended.set(key, s.until.getTime());
        fresh.push(s.channelId);
      }
      return fresh;
    },
    async enqueueReview(workspaceId, review) {
      reviews.push({ workspaceId, review });
    },
    async notify(workspaceId, notification) {
      notifications.push({ workspaceId, notification });
    },
  };
}
