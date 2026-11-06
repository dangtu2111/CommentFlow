'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type KbPublishState, kbPublishAction } from '../../app/app/(guarded)/kb-publish/actions';

export type KbPublishViewProps = {
  preview: {
    added: number;
    changed: number;
    removed: number;
    blockedInjection: number;
    categories: string[];
    needsConfirm: boolean;
  } | null;
  currentNumber: number | null;
  versions: {
    number: number;
    publishedAt: string;
    note: string | null;
    categories: string[];
    chunkCount: number;
  }[];
};

const IDLE: KbPublishState = { status: 'idle' };

/** Xem thay đổi + Xuất bản + danh sách phiên bản với nút Khôi phục (FR-054, UF-8). */
export function KbPublishForm({ preview, currentNumber, versions }: KbPublishViewProps) {
  const t = useTranslations('kbPublish');
  const locale = useLocale();
  const [state, action, pending] = useActionState(kbPublishAction, IDLE);
  const list = (items: string[]) => items.map((c) => t(`category.${c}`)).join(', ');

  return (
    <div className="stack">
      {state.status === 'error' ? <p role="alert">{t(`error.${state.code}`)}</p> : null}
      {state.status === 'queued' ? <p role="status">{t('queued')}</p> : null}
      {state.status === 'no_changes' ? <p role="status">{t('noChangesResult')}</p> : null}

      <section className="card stack">
        <h2>{t('draftTitle')}</h2>
        <p className="muted">
          {currentNumber === null
            ? t('currentNone')
            : t('currentVersion', { number: currentNumber })}
        </p>
        {preview === null ? (
          <p>{t('noChanges')}</p>
        ) : (
          <form action={action} className="stack">
            <input type="hidden" name="intent" value="publish" />
            <p>
              {t('summary', {
                added: preview.added,
                changed: preview.changed,
                removed: preview.removed,
              })}
            </p>
            <p className="muted">{t('categories', { list: list(preview.categories) })}</p>
            {preview.blockedInjection > 0 ? (
              <p role="note">{t('blockedInjection', { count: preview.blockedInjection })}</p>
            ) : null}
            <label htmlFor="kb-publish-note">{t('noteLabel')}</label>
            <input id="kb-publish-note" name="note" className="input" maxLength={500} />
            {preview.needsConfirm ? (
              <label>
                <input type="checkbox" name="confirm" /> {t('confirmPublish')}
              </label>
            ) : null}
            <button type="submit" className="btn" disabled={pending}>
              {t('publish')}
            </button>
          </form>
        )}
      </section>

      <section className="stack">
        <h2>{t('historyTitle')}</h2>
        {versions.length === 0 ? (
          <p className="muted">{t('historyEmpty')}</p>
        ) : (
          <ul className="stack">
            {versions.map((v) => (
              <li key={v.number} className="card stack">
                <p>
                  <strong>{t('versionLabel', { number: v.number })}</strong>{' '}
                  {v.number === currentNumber ? (
                    <span className="badge badge-on">{t('current')}</span>
                  ) : null}
                </p>
                <p className="muted">
                  {t('versionMeta', {
                    date: new Date(v.publishedAt).toLocaleString(locale),
                    chunks: v.chunkCount,
                  })}
                  {v.categories.length > 0
                    ? ` · ${t('categories', { list: list(v.categories) })}`
                    : ''}
                </p>
                {v.note ? <p>{v.note}</p> : null}
                {v.number === currentNumber ? null : (
                  <form action={action} className="row">
                    <input type="hidden" name="intent" value="restore" />
                    <input type="hidden" name="versionNumber" value={v.number} />
                    <label>
                      <input type="checkbox" name="confirm" /> {t('confirmRestore')}
                    </label>
                    <button type="submit" className="btn" disabled={pending}>
                      {t('restore')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
