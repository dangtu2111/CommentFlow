import { Lightbulb, ListChecks, Rocket, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { kbSubnavFor } from '../../lib/kb-structure';
import { KB_ICONS } from './kb-frame';

/**
 * Nội dung trang trung tâm Cơ sở kiến thức (design/stitch/knowledge-base.png): đầu trang + hai nút đi tới Kiểm thử /
 * Xuất bản (trang đã có), thanh độ đầy đủ, thẻ lối tắt có biểu tượng. Chỉ nhận số liệu đã tính sẵn (không tự bịa).
 * `sampleNote` (chỉ trang dev) gắn nhãn [MẪU] cạnh con số.
 */
export async function KbHubView({
  score,
  ready,
  minPercent,
  sampleNote,
}: {
  score: number;
  ready: boolean;
  minPercent: number;
  sampleNote?: string;
}) {
  const [t, tn] = await Promise.all([getTranslations('kb'), getTranslations('shell.nav')]);
  const testsetLabel = tn('kbTestset');
  const publishLabel = tn('kbPublish');
  return (
    <>
      <header className="kb-head">
        <div className="kb-head-text">
          <h1 className="kb-title">{t('title')}</h1>
          <p className="kb-subtitle">{t('subtitle')}</p>
        </div>
        <div className="kb-head-actions">
          <Link href="/app/kb-testset" className="btn btn-tint">
            <ListChecks size={18} aria-hidden="true" />
            {testsetLabel}
          </Link>
          <Link href="/app/kb-publish" className="btn btn-primary">
            <Rocket size={18} aria-hidden="true" />
            {publishLabel}
          </Link>
        </div>
      </header>
      <section className="kb-completeness" aria-labelledby="kb-completeness-title">
        <ShieldCheck size={20} className="kb-completeness-icon" aria-hidden="true" />
        <h2 id="kb-completeness-title">
          {t('completeness')}:{' '}
          <strong>
            {sampleNote ? `${sampleNote} ` : ''}
            {score}%
          </strong>
        </h2>
        <progress
          value={score}
          max={100}
          aria-label={t('completenessAria', { score })}
          className="kb-progress"
        >
          {score}%
        </progress>
        <p className="kb-completeness-hint">
          <Lightbulb size={16} aria-hidden="true" />
          <span>
            {ready ? t('completenessReady') : t('completenessNotReady', { min: minPercent })}
          </span>
          <Link href="/app/readiness">{t('completenessDetail')}</Link>
        </p>
      </section>
      <ul className="kb-cards">
        {kbSubnavFor().map((item) => {
          const Icon = KB_ICONS[item.key];
          return (
            <li key={item.key} className="kb-card">
              <span className="kb-card-icon" aria-hidden="true">
                {Icon ? <Icon size={22} /> : null}
              </span>
              <div className="kb-card-body">
                <h2>{t(`cards.${item.key as 'productImport'}.title`)}</h2>
                <p>{t(`cards.${item.key as 'productImport'}.body`)}</p>
              </div>
              <Link href={item.href} className="btn btn-tint">
                {t('open')}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
