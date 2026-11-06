import { Bot, Filter, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/**
 * Thẻ minh họa ở panel trái trang xác thực (theo thiết kế Stitch). TOÀN BỘ là dữ liệu MẪU để giải thích sản phẩm:
 * luôn gắn nhãn `[MẪU]`, không có số liệu/độ tin cậy giả, không đọc thành nội dung thật (aria-hidden + chú thích cho trình đọc màn hình).
 */
export async function AuthDemoCard() {
  const t = await getTranslations('auth.demo');
  return (
    <figure className="demo-card" aria-label={t('aria')}>
      <div className="demo-flow" aria-hidden="true">
        <figcaption className="demo-head">
          <span className="demo-sample">{t('sample')}</span>
          <span>{t('title')}</span>
        </figcaption>
        <div className="demo-bubble demo-customer">
          <strong>{t('customerName')}</strong>
          <p>{t('customerComment')}</p>
        </div>
        <div className="demo-tags">
          <span className="demo-tag">
            <Filter size={14} aria-hidden="true" />
            {t('tagIntent')}
          </span>
          <span className="demo-tag demo-tag-pii">
            <ShieldCheck size={14} aria-hidden="true" />
            {t('tagPii')}
          </span>
        </div>
        <div className="demo-bubble demo-ai">
          <strong>
            <Bot size={14} aria-hidden="true" /> {t('aiName')}
          </strong>
          <p>{t('aiDraft')}</p>
          <span className="demo-review">{t('needsReview')}</span>
        </div>
      </div>
    </figure>
  );
}
