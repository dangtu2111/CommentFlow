'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type AiSentRowState, markWrongAction } from '../../app/app/(guarded)/ai-sent/actions';

export type AiSentRowData = {
  id: string;
  text: string;
  label: string;
  confidence: number;
  sentAt: string;
  status: 'sent' | 'marked_wrong';
  wrongReason: string | null;
};

const IDLE: AiSentRowState = { status: 'idle' };

/** Một câu AI đã tự gửi: nội dung, nhãn, độ tin cậy, giờ gửi và nút Đánh dấu sai (FR-075). */
export function AiSentRow({ item }: { item: AiSentRowData }) {
  const t = useTranslations('aiSent');
  const locale = useLocale();
  const [state, action, pending] = useActionState(markWrongAction, IDLE);
  const wrong = item.status === 'marked_wrong' || state.status === 'ok';

  return (
    <li className="card stack">
      <p>
        <strong>{item.text}</strong>
      </p>
      <p className="muted">
        {t('meta', {
          label: item.label,
          confidence: Math.round(item.confidence * 100),
          date: new Date(item.sentAt).toLocaleString(locale),
        })}{' '}
        <span className={wrong ? 'badge badge-off' : 'badge badge-on'}>
          {t(wrong ? 'status.marked_wrong' : 'status.sent')}
        </span>
      </p>
      {item.wrongReason ? (
        <p className="muted">{t('reason', { reason: item.wrongReason })}</p>
      ) : null}
      {state.status === 'error' ? <p role="alert">{t(`error.${state.code}`)}</p> : null}
      {wrong ? null : (
        <form action={action} className="row">
          <input type="hidden" name="id" value={item.id} />
          <label htmlFor={`wrong-${item.id}`} className="muted">
            {t('reasonLabel')}
          </label>
          <input
            id={`wrong-${item.id}`}
            name="reason"
            className="input"
            maxLength={300}
            placeholder={t('reasonPlaceholder')}
          />
          <button type="submit" className="btn" disabled={pending}>
            {t('markWrong')}
          </button>
        </form>
      )}
    </li>
  );
}
