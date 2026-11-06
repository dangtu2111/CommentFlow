import { getTranslations } from 'next-intl/server';
import { REPLY_SEND_KEYS } from '../../lib/reply-input';
import { Icon } from '../ui/icon';
import { Kbd } from '../ui/kbd';
import { WorkbenchStrip } from '../ui/workbench';

/** Giá trị ca làm/SLA của dải phụ — chỉ trang xem mẫu truyền (chưa có dữ liệu ca làm thật). */
export type InboxStripSample = { session: string; sla: string };

/**
 * Dải phụ của hộp thư: tiêu đề luồng + ca làm/SLA + phím tắt THẬT (Ctrl/⌘+Enter gửi — `ReplyComposer`; J/K/X/H —
 * `resolveBulkShortcut`) + nút chọn bố cục. Ca làm, SLA và bố cục "Tập trung" chưa có dữ liệu/chức năng nên hiện đúng
 * thiết kế nhưng vô hiệu kèm "Sắp có" (UI-first, QUY TẮC ĐỦ THÀNH PHẦN). Class chép từ `design/stitch/comments.html`.
 */
export async function InboxStrip({ sample }: { sample?: InboxStripSample }) {
  const t = await getTranslations('comments');
  const soon = t('soon');
  const pending = sample ? undefined : true;
  return (
    <WorkbenchStrip>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary-container font-code-sm text-code-sm font-bold text-on-primary"
            aria-hidden="true"
          >
            1
          </span>
          <h1 className="font-headline-sm text-headline-sm text-on-surface">{t('strip.flow')}</h1>
        </div>
        <span
          className="h-1.5 w-1.5 rounded-full bg-surface-container-highest"
          aria-hidden="true"
        />
        <p className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
          <span>{`${t('strip.session')}:`}</span>
          <strong
            className="font-semibold text-primary"
            aria-disabled={pending}
            title={sample ? undefined : soon}
          >
            {sample?.session ?? soon}
          </strong>
        </p>
        <span
          className="rounded-full bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant"
          aria-disabled={pending}
        >
          {`${t('strip.sla')}: `}
          <strong className="text-primary-container">{sample?.sla ?? '—'}</strong>
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <p className="flex items-center gap-2 rounded bg-surface-container-low px-2.5 py-1 font-label-sm text-label-sm text-on-surface-variant">
          <span className="text-secondary">
            <Icon name="bolt" size={14} />
          </span>
          <span>{`${t('strip.shortcuts')}:`}</span>
          <Kbd>{REPLY_SEND_KEYS.replace(/\s/g, '')}</Kbd> <span>{t('strip.send')}</span>
          <span className="text-outline-variant" aria-hidden="true">
            |
          </span>
          <Kbd>H</Kbd> <span>{t('strip.hide')}</span>
          {/* Phím tắt chọn nhiều: chỉ hiện khi dải đủ rộng (Stitch chỉ có Ctrl+Enter/H/E). */}
          <span className="hidden items-center gap-1 min-[1700px]:inline-flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> <span>{t('strip.move')}</span> <Kbd>X</Kbd>{' '}
            <span>{t('strip.select')}</span>
          </span>
        </p>
        <div className="flex items-center gap-1 rounded bg-surface-container p-0.5">
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-surface-container-lowest px-2 py-1 font-label-sm text-label-sm text-on-surface shadow-sm"
            aria-pressed="true"
          >
            <span className="text-primary-container">
              <Icon name="view_column" size={12} />
            </span>
            {t('strip.layoutStandard')}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 font-label-sm text-label-sm text-on-surface-variant aria-[disabled=true]:opacity-60"
            aria-disabled="true"
            tabIndex={-1}
            title={soon}
          >
            <Icon name="fullscreen" size={12} />
            {t('strip.layoutFocus')}
          </button>
        </div>
      </div>
    </WorkbenchStrip>
  );
}
