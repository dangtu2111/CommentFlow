'use client';

import type { KbGapStatus, KbGapTopic } from '@flow/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  type KbGapRetryState,
  type KbGapRowState,
  kbGapAction,
  retryKbGapAction,
} from '../../app/app/(guarded)/kb-gaps/actions';
import { cardLinksOfTopic } from '../../lib/kb-gaps-links';

export type KbGapRowData = {
  id: string;
  topic: KbGapTopic;
  sampleQuestionMasked: string;
  count: number;
  lastSeenAt: string;
  status: KbGapStatus;
};

const IDLE: KbGapRowState = { status: 'idle' };
const RETRY_ERRORS: Record<string, true> = {
  limit_reached: true,
  llm_missing_service: true,
  llm_missing_model: true,
  llm_flag_off: true,
  no_knowledge: true,
  ai_invalid_output: true,
  unavailable: true,
};
const RETRY_IDLE: KbGapRetryState = { status: 'idle' };

/** Một câu hỏi chưa trả lời được: số lần hỏi, câu ví dụ (đã che PII) và ô bổ sung nhanh (UF-11). */
export function KbGapRow({ gap, newCard = false }: { gap: KbGapRowData; newCard?: boolean }) {
  const t = useTranslations('kbGaps');
  const locale = useLocale();
  const [state, action, pending] = useActionState(kbGapAction, IDLE);
  const [retry, retryAction, retrying] = useActionState(retryKbGapAction, RETRY_IDLE);
  const cards = cardLinksOfTopic(gap.topic);
  const defaultLang = locale === 'en' ? 'en' : 'vi';
  const id = `gap-${gap.id}`;

  return (
    <li className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
      <p>
        <strong>{gap.sampleQuestionMasked}</strong>
      </p>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {t('seen', { count: gap.count, date: new Date(gap.lastSeenAt).toLocaleDateString(locale) })}{' '}
        <span className={gap.status === 'open' ? 'badge badge-off' : 'badge badge-on'}>
          {t(`status.${gap.status}`)}
        </span>
        {newCard ? (
          <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
            {t('newCard')}
          </span>
        ) : null}
      </p>
      {state.status === 'error' ? <p role="alert">{t(`error.${state.code}`)}</p> : null}
      {cards.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {cards.map((link) => (
            <Link
              key={link.card}
              href={link.href}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-title-sm text-title-sm shadow-sm transition-colors"
            >
              {t('fillCard', { card: t(`card.${link.card}`) })}
            </Link>
          ))}
        </div>
      ) : null}
      <form action={retryAction} className="space-y-space-md">
        <input type="hidden" name="gapId" value={gap.id} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-title-sm text-title-sm shadow-sm transition-colors"
            disabled={retrying}
          >
            {t('retry')}
          </button>
        </div>
        {retry.status === 'done' && retry.ok ? (
          <p role="status" className="font-body-sm text-body-sm text-on-surface-variant">
            {t('retryResult', { action: t(`retryAction.${retry.action}`) })}{' '}
            {retry.reply === '' ? t('retryNoReply') : <q>{retry.reply}</q>}
            {retry.needsHuman ? ` ${t('retryNeedsHuman')}` : ''}
          </p>
        ) : null}
        {retry.status === 'done' && !retry.ok ? (
          <p role="alert">
            {retry.reason === 'throttled'
              ? t('retryThrottled', { seconds: retry.retryAfterSec ?? 60 })
              : t(`retryError.${retry.reason in RETRY_ERRORS ? retry.reason : 'unavailable'}`)}
          </p>
        ) : null}
      </form>
      {gap.status === 'open' ? (
        <form action={action} className="space-y-space-md">
          <input type="hidden" name="gapId" value={gap.id} />
          <label htmlFor={`${id}-q`}>{t('questionLabel')}</label>
          <input
            id={`${id}-q`}
            name="question"
            className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all"
            maxLength={1000}
            defaultValue={gap.sampleQuestionMasked}
          />
          <label htmlFor={`${id}-a`}>{t('answerLabel')}</label>
          <textarea
            id={`${id}-a`}
            name="answer"
            className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all"
            rows={3}
            maxLength={8000}
          />
          <label htmlFor={`${id}-l`}>{t('langLabel')}</label>
          <select
            id={`${id}-l`}
            name="lang"
            className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all"
            defaultValue={defaultLang}
          >
            <option value="vi">{t('lang.vi')}</option>
            <option value="en">{t('lang.en')}</option>
            <option value="all">{t('lang.all')}</option>
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              name="intent"
              value="resolve"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-title-sm text-title-sm shadow-md transition-all disabled:opacity-60"
              disabled={pending}
            >
              {t('add')}
            </button>
            <button
              type="submit"
              name="intent"
              value="ignore"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-title-sm text-title-sm shadow-sm transition-colors"
              disabled={pending}
              formNoValidate
            >
              {t('ignore')}
            </button>
          </div>
        </form>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="gapId" value={gap.id} />
          <button
            type="submit"
            name="intent"
            value="reopen"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-title-sm text-title-sm shadow-sm transition-colors"
            disabled={pending}
          >
            {t('reopen')}
          </button>
        </form>
      )}
    </li>
  );
}
