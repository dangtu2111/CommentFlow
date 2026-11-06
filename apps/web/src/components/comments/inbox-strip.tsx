import { Zap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { REPLY_SEND_KEYS } from '../../lib/reply-input';
import { Kbd } from '../ui/kbd';
import { WorkbenchStrip } from '../ui/workbench';

/**
 * Dải phụ của hộp thư: tiêu đề trang + phím tắt THẬT (Ctrl/⌘+Enter gửi — `ReplyComposer`; J/K/X/H — `resolveBulkShortcut`).
 * Không dựng ca làm/SLA/chế độ "Tập trung" của thiết kế vì chưa có dữ liệu/chức năng (Q-UIHC1).
 */
export async function InboxStrip() {
  const t = await getTranslations('comments');
  return (
    <WorkbenchStrip>
      <h1 className="inbox-title">{t('title')}</h1>
      <p className="inbox-shortcuts">
        <Zap size={14} aria-hidden="true" />
        <span>{t('strip.shortcuts')}:</span>
        <Kbd>{REPLY_SEND_KEYS}</Kbd> <span>{t('strip.send')}</span>
        <span className="inbox-shortcuts-sep" aria-hidden="true">
          |
        </span>
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> <span>{t('strip.move')}</span>
        <Kbd>X</Kbd> <span>{t('strip.select')}</span>
        <Kbd>H</Kbd> <span>{t('strip.hide')}</span>
      </p>
    </WorkbenchStrip>
  );
}
