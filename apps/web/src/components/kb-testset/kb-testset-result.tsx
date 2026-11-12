import type { TestCaseResult, TestSetSummary } from '@flow/ai';
import { useTranslations } from 'next-intl';

const CARD = 'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';
const TD = 'px-space-md py-space-sm align-top font-body-md text-body-md text-on-surface';

/** Kết quả bộ câu kiểm thử (dựng theo bảng "Bộ câu kiểm thử" của `kb-testlab.html`): tóm tắt + cổng đạt/chưa đạt + từng câu (mong đợi vs thực tế). Chỉ dữ liệu thật của lần chạy. */
export function KbTestSetResultView({
  results,
  summary,
}: {
  results: readonly TestCaseResult[];
  summary: TestSetSummary;
}) {
  const t = useTranslations('kbTestset');
  return (
    <section className={CARD} aria-label={t('summary', summary)}>
      <p className="font-title-md text-title-md text-on-surface">{t('summary', summary)}</p>
      <p
        role="status"
        className="px-3 py-2 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-title-sm text-title-sm"
      >
        {t(`gate.${summary.gate}`)}
      </p>
      <div className="overflow-x-auto rounded-xl bg-surface-container-low">
        <table className="w-full">
          <tbody className="divide-y divide-surface-container">
            {results.map((r) => (
              <tr key={r.index}>
                <td className={TD}>
                  <strong>{t('result.line', { n: r.index + 1 })}</strong>
                  <div className={MUTED}>{t(`result.${r.status}`)}</div>
                </td>
                <td className={`${TD} space-y-1`}>
                  <p>{r.question}</p>
                  <p className={MUTED}>
                    {t('result.expected')}: {t(`actions.${r.expected}`)}
                    {r.actual ? ` · ${t('result.actual')}: ${t(`actions.${r.actual}`)}` : ''}
                  </p>
                  {r.failures.map((f) => (
                    <p
                      key={f}
                      role="alert"
                      className="px-2 py-1 rounded bg-error-container text-on-error-container font-body-sm text-body-sm"
                    >
                      {t(`failures.${f}`)}
                    </p>
                  ))}
                  {r.missing.length > 0 ? (
                    <p className={MUTED}>{t('result.missing', { words: r.missing.join(', ') })}</p>
                  ) : null}
                  {r.reply ? (
                    <p className={MUTED}>
                      {t('result.reply')}: {r.reply}
                    </p>
                  ) : null}
                  {r.error ? (
                    <p className={MUTED}>{t('result.errorName', { name: r.error })}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
