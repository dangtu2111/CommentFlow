'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type DragEvent, type ReactNode, useState, useTransition } from 'react';
import { movePublishPostAction } from '../../app/app/(guarded)/calendar/actions';
import { cx } from '../../lib/cx';

/**
 * Kéo thả trên lưới tuần của Lịch (CALENDAR-DND). Bài ĐÃ LÊN LỊCH kéo sang ngày khác = đổi ngày, giữ nguyên giờ (Server Action, DB kiểm lại); BẢN NHÁP kéo vào một ngày = mở hộp thoại bài
 * với ngày đó đã điền sẵn để Owner tự bấm "Lên lịch" (lên lịch là hành động hướng ra ngoài nên không tự làm khi thả). Bài đã đăng/đang đăng/lỗi không kéo được. Dùng HTML5 drag-and-drop
 * (chuột); trên cảm ứng/bàn phím dùng hộp thoại bài để đổi ngày giờ. Dữ liệu kéo chỉ mang id + loại; quyền do Server Action và DB quyết định.
 */
export const DRAG_TYPE = 'application/x-commentflow-post';
export type DragKind = 'scheduled' | 'draft';
type Payload = { id: string; kind: DragKind; day: string | null };

function readPayload(event: DragEvent): Payload | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    const parsed = JSON.parse(raw) as Partial<Payload>;
    if (typeof parsed.id !== 'string' || (parsed.kind !== 'scheduled' && parsed.kind !== 'draft')) {
      return null;
    }
    return { id: parsed.id, kind: parsed.kind, day: parsed.day ?? null };
  } catch {
    return null;
  }
}

/** Thẻ bài kéo được (chỉ khi `kind` có giá trị); không thì hiển thị nguyên trạng. */
export function DragPost({
  id,
  kind,
  day,
  children,
}: {
  id: string;
  /** Loại bài kéo được; `null` = không kéo được. */
  kind: DragKind | null;
  day: string | null;
  children: ReactNode;
}) {
  const t = useTranslations('calendar');
  if (kind === null) return <>{children}</>;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: nguồn kéo của HTML5 drag-and-drop; bàn phím/cảm ứng dùng hộp thoại bài (liên kết bên trong) để đổi ngày giờ
    <div
      draggable
      title={t('dnd.dragHint')}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id, kind, day }));
        event.dataTransfer.effectAllowed = 'move';
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

/** Ô một ngày của lưới tuần: nhận bài thả vào. */
export function DayDropZone({
  day,
  weekStart,
  isToday,
  className,
  children,
}: {
  day: string;
  weekStart: string;
  isToday: boolean;
  className: string;
  children: ReactNode;
}) {
  const t = useTranslations('calendar');
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [pending, startMove] = useTransition();

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const payload = readPayload(event);
    if (!payload || payload.day === day) return;
    if (payload.kind === 'draft') {
      router.push(`/app/calendar?w=${weekStart}&post=${payload.id}&date=${day}`);
      return;
    }
    startMove(async () => {
      await movePublishPostAction(payload.id, day);
    });
  };

  return (
    <li
      aria-current={isToday ? 'date' : undefined}
      aria-busy={pending || undefined}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DRAG_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      className={cx(className, over ? 'ring-2 ring-primary' : '', pending ? 'opacity-60' : '')}
    >
      {children}
      {over ? (
        <span className="pointer-events-none rounded-lg bg-primary-fixed/70 p-space-xs text-center font-label-md text-label-md text-on-surface">
          {t('dnd.dropHere')}
        </span>
      ) : null}
      {pending ? (
        <span role="status" className="font-label-sm text-label-sm text-on-surface-variant">
          {t('dnd.moving')}
        </span>
      ) : null}
    </li>
  );
}
