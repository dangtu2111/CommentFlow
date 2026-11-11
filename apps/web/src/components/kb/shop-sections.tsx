import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Field } from './kb-content-ui';

/**
 * Trang "Thông tin cửa hàng" (KB-SHOP-V2, PR2 UI-first, Q-UIF1): các khối theo `design/stitch/kb-shop.png`, dựng bằng Tailwind (bọc trong `.tw`), tự co ở 390 px.
 * Chỉ dữ liệu 6 cột hiện có (tên, mô tả, địa chỉ, giờ mở cửa, liên hệ, website) là ô nhập thật. Khối chưa có nền tảng (khẩu hiệu, ngành, chi nhánh,
 * giờ trực, kênh Zalo/Shopee/TikTok, pháp lý, ngân hàng/VietQR, AI trực ca đêm, Google Maps, logo) là ô/nút TẮT kèm chú thích — không số mẫu, không logic mới.
 */
type Translate = (key: string) => string;

const INPUT_DISABLED =
  'w-full rounded-lg bg-surface-container px-3 py-2 font-body-md text-body-md text-on-surface-variant/70 cursor-not-allowed';

export function ShopSection({
  id,
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="flex items-start gap-space-sm">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary"
          >
            {icon}
          </span>
          <div>
            <h2 id={id} className="font-title-md text-title-md text-on-surface">
              {title}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
          </div>
        </div>
        {badge}
      </header>
      {children}
    </section>
  );
}

/** Huy hiệu "Sắp có": khối/nút chưa hoạt động (không bịa số, không giả hành vi). */
export function SoonBadge({ t }: { t: Translate }) {
  return (
    <span className="rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm text-on-surface-variant">
      {t('shop.soon')}
    </span>
  );
}

/** Ô nhập TẮT kèm chú thích lý do (nối `aria-describedby`). */
function DisabledField({
  id,
  label,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-title-sm text-title-sm text-on-surface">
        {label}
      </label>
      <input
        id={id}
        disabled
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={INPUT_DISABLED}
      />
      {hint ? (
        <span id={`${id}-hint`} className="block font-body-sm text-body-sm text-on-surface-variant">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function DisabledButton({ children, note }: { children: ReactNode; note: string }) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled
        className="rounded-lg bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface-variant/70 cursor-not-allowed"
      >
        {children}
      </button>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{note}</p>
    </div>
  );
}

/** Các khối của MỘT bản ngôn ngữ (nằm trong `<form>` của trang). `profile = null` là bản mới. */
export function ShopSections({
  profile,
  t,
  idPrefix,
}: {
  profile: {
    name: string;
    website: string | null;
    description: string | null;
    address: string | null;
    openingHours: string | null;
    contact: string | null;
  } | null;
  t: Translate;
  idPrefix: string;
}) {
  const p = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="space-y-space-lg">
      <ShopSection
        id={p('identity')}
        icon="◎"
        title={t('shop.identity.title')}
        subtitle={t('shop.identity.subtitle')}
      >
        <div className="grid gap-space-md md:grid-cols-2">
          <div className="space-y-space-md">
            <Field
              label={t('shop.name')}
              name="name"
              defaultValue={profile?.name}
              required
              maxLength={200}
            />
            <DisabledField id={p('slogan')} label={t('shop.slogan')} hint={t('shop.soonHint')} />
            <DisabledField
              id={p('industries')}
              label={t('shop.industries')}
              hint={t('shop.soonHint')}
            />
            <DisabledButton note={t('shop.logoNote')}>{t('shop.logo')}</DisabledButton>
          </div>
          <Field
            label={t('shop.description')}
            name="description"
            rows={9}
            defaultValue={profile?.description}
            hint={t('shop.descriptionHint')}
            maxLength={2000}
          />
        </div>
      </ShopSection>

      <ShopSection
        id={p('locations')}
        icon="⌖"
        title={t('shop.locations.title')}
        subtitle={t('shop.locations.subtitle')}
      >
        <Field
          label={t('shop.address')}
          name="address"
          defaultValue={profile?.address}
          maxLength={500}
        />
        <div className="rounded-lg bg-surface-container px-space-md py-space-md">
          <p className="font-title-sm text-title-sm text-on-surface">{t('shop.branches.title')}</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t('shop.branches.empty')}
          </p>
        </div>
        <div className="flex flex-wrap gap-space-md">
          <DisabledButton note={t('shop.soonHint')}>{t('shop.branches.add')}</DisabledButton>
          <DisabledButton note={t('shop.soonHint')}>{t('shop.maps')}</DisabledButton>
        </div>
      </ShopSection>

      <div className="grid gap-space-lg md:grid-cols-2">
        <ShopSection
          id={p('hours')}
          icon="◷"
          title={t('shop.hours.title')}
          subtitle={t('shop.hours.subtitle')}
        >
          <Field
            label={t('shop.openingHours')}
            name="openingHours"
            defaultValue={profile?.openingHours}
            maxLength={500}
          />
          <DisabledField
            id={p('support')}
            label={t('shop.hours.support')}
            hint={t('shop.soonHint')}
          />
          <DisabledButton note={t('shop.hours.nightNote')}>{t('shop.hours.night')}</DisabledButton>
        </ShopSection>

        <ShopSection
          id={p('channels')}
          icon="@"
          title={t('shop.channels.title')}
          subtitle={t('shop.channels.subtitle')}
        >
          <Field
            label={t('shop.contact')}
            name="contact"
            defaultValue={profile?.contact}
            hint={t('shop.contactHint')}
            maxLength={200}
          />
          <Field
            label={t('shop.website')}
            name="website"
            type="url"
            defaultValue={profile?.website}
            maxLength={500}
          />
          <DisabledField id={p('zalo')} label={t('shop.channels.zalo')} hint={t('shop.soonHint')} />
          <div className={cn('grid gap-space-md', 'sm:grid-cols-2')}>
            <DisabledField id={p('shopee')} label={t('shop.channels.shopee')} />
            <DisabledField id={p('tiktok')} label={t('shop.channels.tiktok')} />
          </div>
        </ShopSection>
      </div>

      <ShopSection
        id={p('legal')}
        icon="▣"
        title={t('shop.legal.title')}
        subtitle={t('shop.legal.subtitle')}
        badge={<SoonBadge t={t} />}
      >
        <div className="grid gap-space-md md:grid-cols-2">
          <DisabledField id={p('legalName')} label={t('shop.legal.name')} />
          <DisabledField id={p('taxId')} label={t('shop.legal.taxId')} />
        </div>
        <DisabledButton note={t('shop.legal.bankNote')}>{t('shop.legal.bank')}</DisabledButton>
      </ShopSection>
    </div>
  );
}
