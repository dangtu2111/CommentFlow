import { Columns3, Maximize, Zap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { REPLY_SEND_KEYS } from '../../lib/reply-input';
import { Kbd } from '../ui/kbd';
import { WorkbenchStrip } from '../ui/workbench';

/** Giá trị ca làm/SLA của dải phụ — chỉ trang xem mẫu truyền (chưa có dữ liệu ca làm thật). */
export type InboxStripSample = { session: string; sla: string };

/**
 * Dải phụ của hộp thư: tiêu đề luồng + ca làm/SLA + phím tắt THẬT (Ctrl/⌘+Enter gửi — `ReplyComposer`; J/K/X/H —
 * `resolveBulkShortcut`) + nút chọn bố cục. Ca làm, SLA và bố cục "Tập trung" chưa có dữ liệu/chức năng nên hiện đúng
 * thiết kế nhưng vô hiệu kèm "Sắp có" (UI-first, QUY TẮC ĐỦ THÀNH PHẦN).
 */
export async function InboxStrip({ sample }: { sample?: InboxStripSample }) {
  const t = await getTranslations('comments');
  const soon = t('soon');
  return (
    <WorkbenchStrip>
      <div className="inbox-strip-start">
        <span className="inbox-strip-step" aria-hidden="true">
          1
        </span>
        <h1 className="inbox-title">{t('strip.flow')}</h1>
        <span className="inbox-strip-dot" aria-hidden="true" />
        <p className="inbox-strip-session">
          <span>{`${t('strip.session')}:`}</span>
          <strong aria-disabled={sample ? undefined : true} title={sample ? undefined : soon}>
            {sample?.session ?? soon}
          </strong>
        </p>
        <span className="inbox-strip-sla" aria-disabled={sample ? undefined : true}>
          {`${t('strip.sla')}: `}
          <strong>{sample?.sla ?? '—'}</strong>
        </span>
      </div>
      <div className="inbox-strip-end">
        <p className="inbox-shortcuts">
          <Zap size={14} aria-hidden="true" />
          <span>{`${t('strip.shortcuts')}:`}</span>
          <Kbd>{REPLY_SEND_KEYS.replace(/\s/g, '')}</Kbd> <span>{t('strip.send')}</span>
          <span className="inbox-shortcuts-sep" aria-hidden="true">
            |
          </span>
          <Kbd>H</Kbd> <span>{t('strip.hide')}</span>
          {/* Phím tắt chọn nhiều: chỉ hiện khi dải đủ rộng (Stitch chỉ có Ctrl+Enter/H/E). */}
          <span className="inbox-shortcuts-wide">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> <span>{t('strip.move')}</span> <Kbd>X</Kbd>{' '}
            <span>{t('strip.select')}</span>
          </span>
        </p>
        <div className="inbox-layout-toggle">
          <button type="button" className="inbox-layout-btn" aria-pressed="true">
            <Columns3 size={12} aria-hidden="true" />
            {t('strip.layoutStandard')}
          </button>
          <button
            type="button"
            className="inbox-layout-btn"
            aria-disabled="true"
            tabIndex={-1}
            title={soon}
          >
            <Maximize size={12} aria-hidden="true" />
            {t('strip.layoutFocus')}
          </button>
        </div>
      </div>
    </WorkbenchStrip>
  );
}
