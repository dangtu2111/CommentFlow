import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ShopSections } from '../../../../components/kb/shop-sections';

/** Xem các khối "Thông tin cửa hàng" ở trạng thái TRỐNG (không dữ liệu) — CHỈ khi `NODE_ENV !== 'production'`. Không đọc DB/phiên (đo `pnpm ui:fidelity kb-shop`). */
export default async function DevKbShopPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('kbContent');
  return (
    <main className="app-page app-page-wide">
      <div className="tw space-y-space-lg">
        <h1 className="font-headline-md text-headline-md text-on-surface">{t('shop.title')}</h1>
        <form className="space-y-space-md">
          <ShopSections profile={null} t={t} idPrefix="dev-shop" />
        </form>
      </div>
    </main>
  );
}
