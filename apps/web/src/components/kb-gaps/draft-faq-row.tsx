'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type DraftFaqState, reviewDraftFaqAction } from '../../app/app/(guarded)/kb-gaps/actions';

export type DraftFaqData = {
  id: string;
  /** `faq` | `product_attr` (CHECK ở DB). */
  kind: string;
  question: string;
  answer: string;
  evidenceQuote: string;
};

const IDLE: DraftFaqState = { status: 'idle' };

/** Một gợi ý chắt lọc chờ duyệt: câu hỏi/đáp, loại, câu trích nguyên văn làm bằng chứng, nút Duyệt/Từ chối (chỉ Owner). */
export function DraftFaqRow({ draft }: { draft: DraftFaqData }) {
  const t = useTranslations('kbGaps.drafts');
  const [state, action, pending] = useActionState(reviewDraftFaqAction, IDLE);
  if (state.status === 'approved' || state.status === 'rejected') {
    return (
      <li className="card" role="status">
        <p className="muted">{t(state.status)}</p>
      </li>
    );
  }
  return (
    <li className="card stack">
      <p className="muted">{t(`kind.${draft.kind}`)}</p>
      <p>
        <strong>{draft.question}</strong>
      </p>
      <p>{draft.answer}</p>
      <blockquote className="muted">
        <span>{t('evidence')}: </span>“{draft.evidenceQuote}”
      </blockquote>
      <form action={action} className="row">
        <input type="hidden" name="id" value={draft.id} />
        <button type="submit" name="intent" value="approve" disabled={pending}>
          {t('approve')}
        </button>
        <button type="submit" name="intent" value="reject" disabled={pending}>
          {t('reject')}
        </button>
      </form>
      {state.status === 'error' ? <p role="alert">{t('error')}</p> : null}
    </li>
  );
}
