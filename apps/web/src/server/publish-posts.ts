import type { PublishPostItem } from '@flow/db/runtime';
import type { CalendarEditValue } from '../lib/calendar-edit-form';
import { moveToDay } from '../lib/calendar-move';
import { weekStartOf } from '../lib/calendar-week';
import type { PublishFormValue } from '../lib/publish-form';
import { utcToLocalParts } from '../lib/zoned-time';

export type PublishSession = { workspaceId: string; userId: string };

export type PublishNotice =
  | 'saved'
  | 'scheduled'
  | 'publishing'
  | 'cancelled'
  | 'deleted'
  | 'publish_disabled'
  | 'forbidden'
  | 'unavailable'
  | 'not_editable'
  | 'invalid_channel'
  | 'invalid_schedule'
  | 'invalid'
  | 'moved'
  | 'updated';

/** Kết quả một thao tác của Owner: thông báo + nơi chuyển tới (`week` = thứ Hai của tuần chứa giờ đăng, để Lịch mở đúng tuần). */
export type PublishActionResult = {
  notice: PublishNotice;
  postId?: string;
  to: 'composer' | 'calendar';
  week?: string;
};

export type PublishPostDeps = {
  /** Cờ `FB_PUBLISH_ENABLED` (mặc định TẮT): tắt → vẫn lưu nháp, nhưng KHÔNG lên lịch/đăng. */
  publishEnabled: () => boolean;
  save: (
    session: PublishSession,
    input: {
      id: string | undefined;
      message: string;
      channelIds: string[];
      productIds: string[];
      mediaIds: string[];
      aiNote: string | null;
      scheduledAt: Date | null;
    },
  ) => Promise<string>;
  publishNow: (session: PublishSession, id: string) => Promise<boolean>;
  cancelSchedule: (session: PublishSession, id: string) => Promise<boolean>;
  remove: (session: PublishSession, id: string) => Promise<boolean>;
  /** Đọc một bài của workspace (để kéo thả giữ nguyên giờ/nội dung). */
  get: (session: PublishSession, id: string) => Promise<PublishPostItem | null>;
  /** Sửa nhanh nội dung/giờ (hàm DB `update_publish_post`). */
  update: (
    session: PublishSession,
    input: { id: string; message: string; scheduledAt: Date | null },
  ) => Promise<void>;
  warn: (event: { event: string; reason: string }) => void;
};

/** Mã lỗi Postgres và thông điệp thô; Drizzle bọc lỗi gốc trong `cause`. */
function pgOf(error: unknown): { code: string | undefined; message: string } {
  for (let current: unknown = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      const e = current as { code: unknown; message?: unknown };
      return { code: String(e.code), message: typeof e.message === 'string' ? e.message : '' };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return { code: undefined, message: '' };
}

/**
 * Dịch vụ thao tác bài đăng của web (POST-PUBLISHING, Q-PUB1). Quyền do DB quyết định (hàm DEFINER chỉ Owner → 42501); ở đây chỉ điều phối ý định
 * (nháp / lên lịch / đăng ngay), chặn khi cờ tắt và dịch lỗi. Không log nội dung bài; chỉ MÃ lỗi. Workspace/người dùng luôn từ phiên, không từ form.
 */
export function createPublishPostService(deps: PublishPostDeps) {
  const fail = (error: unknown, to: PublishActionResult['to']): PublishActionResult => {
    const { code, message } = pgOf(error);
    if (code === '42501') return { notice: 'forbidden', to };
    if (code === '55000') return { notice: 'not_editable', to: 'calendar' };
    if (code === '22023') {
      if (message.includes('invalid channel')) return { notice: 'invalid_channel', to };
      if (message.includes('invalid schedule')) return { notice: 'invalid_schedule', to };
      return { notice: 'invalid', to };
    }
    deps.warn({ event: 'publish_post_failed', reason: code ?? 'unknown' });
    return { notice: 'unavailable', to };
  };

  return {
    async submit(
      session: PublishSession,
      value: PublishFormValue,
      timeZone: string,
    ): Promise<PublishActionResult> {
      if (value.intent !== 'draft' && !deps.publishEnabled()) {
        return { notice: 'publish_disabled', to: 'composer' };
      }
      let postId: string;
      try {
        postId = await deps.save(session, {
          id: value.id,
          message: value.message,
          channelIds: value.channelIds,
          productIds: value.productIds,
          mediaIds: value.mediaIds,
          aiNote: value.aiNote,
          scheduledAt: value.intent === 'schedule' ? value.scheduledAt : null,
        });
      } catch (error) {
        return fail(error, 'composer');
      }
      if (value.intent === 'draft') return { notice: 'saved', postId, to: 'composer' };
      if (value.intent === 'schedule') {
        const week = value.scheduledAt
          ? weekStartOf(utcToLocalParts(value.scheduledAt, timeZone).date)
          : undefined;
        return { notice: 'scheduled', postId, to: 'calendar', ...(week ? { week } : {}) };
      }
      try {
        return (await deps.publishNow(session, postId))
          ? { notice: 'publishing', postId, to: 'calendar' }
          : { notice: 'unavailable', postId, to: 'composer' };
      } catch (error) {
        return { ...fail(error, 'composer'), postId };
      }
    },

    /** Kéo bài ĐÃ LÊN LỊCH sang ngày khác trên Lịch: giữ nguyên giờ địa phương của cửa hàng, đổi ngày. */
    async move(
      session: PublishSession,
      id: string,
      day: string,
      timeZone: string,
      now: Date = new Date(),
    ): Promise<PublishActionResult> {
      try {
        const post = await deps.get(session, id);
        if (!post || post.status !== 'scheduled' || !post.scheduledAt) {
          return { notice: 'not_editable', to: 'calendar' };
        }
        const next = moveToDay(post.scheduledAt, day, timeZone, now);
        if (!next) return { notice: 'invalid_schedule', to: 'calendar', week: weekStartOf(day) };
        await deps.update(session, { id, message: post.message, scheduledAt: next });
        return { notice: 'moved', postId: id, to: 'calendar', week: weekStartOf(day) };
      } catch (error) {
        return fail(error, 'calendar');
      }
    },

    /** Lưu thay đổi từ hộp thoại bài trên Lịch (nội dung và/hoặc giờ). Lên lịch/đổi giờ cần cờ đăng bài bật (như Biên tập). */
    async edit(
      session: PublishSession,
      value: CalendarEditValue,
      timeZone: string,
    ): Promise<PublishActionResult> {
      if (value.scheduledAt && !deps.publishEnabled()) {
        return { notice: 'publish_disabled', to: 'calendar' };
      }
      try {
        await deps.update(session, {
          id: value.id,
          message: value.message,
          scheduledAt: value.scheduledAt,
        });
        const week = value.scheduledAt
          ? weekStartOf(utcToLocalParts(value.scheduledAt, timeZone).date)
          : undefined;
        return {
          notice: value.scheduledAt ? 'updated' : 'saved',
          postId: value.id,
          to: 'calendar',
          ...(week ? { week } : {}),
        };
      } catch (error) {
        return fail(error, 'calendar');
      }
    },

    async cancelSchedule(session: PublishSession, id: string): Promise<PublishActionResult> {
      try {
        return (await deps.cancelSchedule(session, id))
          ? { notice: 'cancelled', postId: id, to: 'composer' }
          : { notice: 'not_editable', to: 'calendar' };
      } catch (error) {
        return fail(error, 'calendar');
      }
    },

    async remove(session: PublishSession, id: string): Promise<PublishActionResult> {
      try {
        return (await deps.remove(session, id))
          ? { notice: 'deleted', to: 'calendar' }
          : { notice: 'not_editable', to: 'calendar' };
      } catch (error) {
        return fail(error, 'calendar');
      }
    },
  };
}
