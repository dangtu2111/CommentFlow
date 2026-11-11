import { type ReactNode, useId } from 'react';
import { Icon, type IconName } from '../ui/icon';

/**
 * Trang "Thông tin cửa hàng" (KB-SHOP-V2): các khối dựng bằng Tailwind, class chép từ `design/stitch/kb-shop.html` (ADR 013), tự co ở 390 px.
 * Chỉ dữ liệu 6 cột hiện có (tên, mô tả, địa chỉ, giờ mở cửa, liên hệ, website) là ô nhập thật. Khối chưa có nền tảng (khẩu hiệu, ngành, chi nhánh, giờ trực,
 * Zalo/Shopee/TikTok, pháp lý, ngân hàng/VietQR, AI trực ca đêm, Google Maps, logo) là ô/nút TẮT kèm chú thích — không số mẫu, không logic mới.
 */
type Translate = (key: string) => string;

const LABEL = 'block font-title-sm text-title-sm text-on-surface mb-1';
const INPUT =
  'w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:outline-none focus:shadow-md transition-all';
const INPUT_OFF = `${INPUT} cursor-not-allowed text-on-surface-variant/70`;
const HINT = 'mt-1 font-body-sm text-body-sm text-on-surface-variant';
const HEAD_BAR =
  'bg-surface-container-low -mx-space-xl -mt-space-xl p-space-md rounded-t-xl pb-space-md mb-space-md';

function SectionHead({
  icon,
  title,
  subtitle,
  id,
  right,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  id: string;
  right?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between gap-space-sm ${HEAD_BAR}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
          <Icon name={icon} size={18} />
        </div>
        <div>
          <h2 id={id} className="font-headline-sm text-headline-sm text-on-surface">
            {title}
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

const SECTION = 'bg-surface-container-lowest rounded-xl p-space-xl shadow-sm';

/** Ô nhập THẬT (đã có cột): nhãn riêng, chú thích nối `aria-describedby`. */
function RealField({
  label,
  name,
  defaultValue,
  hint,
  rows,
  required,
  type = 'text',
  maxLength,
  icon,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  hint?: string;
  rows?: number;
  required?: boolean;
  type?: 'text' | 'url';
  maxLength?: number;
  icon?: IconName;
}) {
  const id = useId();
  const common = {
    id,
    name,
    required,
    maxLength,
    defaultValue: defaultValue ?? '',
    className: rows
      ? 'w-full p-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-md text-body-md focus:outline-none focus:shadow-md transition-all resize-y'
      : INPUT,
    'aria-describedby': hint ? `${id}-hint` : undefined,
  };
  const control = rows ? <textarea rows={rows} {...common} /> : <input type={type} {...common} />;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </label>
      {icon ? (
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-primary shrink-0">
            <Icon name={icon} size={16} />
          </div>
          {control}
        </div>
      ) : (
        control
      )}
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Ô nhập TẮT kèm lý do (chưa có nền tảng lưu trữ). */
function OffField({ label, hint, icon }: { label: string; hint?: string; icon?: IconName }) {
  const id = useId();
  const control = (
    <input
      id={id}
      disabled
      className={INPUT_OFF}
      aria-describedby={hint ? `${id}-hint` : undefined}
    />
  );
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {icon ? (
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-primary shrink-0">
            <Icon name={icon} size={16} />
          </div>
          {control}
        </div>
      ) : (
        control
      )}
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function OffButton({ children, note }: { children: ReactNode; note: string }) {
  return (
    <div>
      <button
        type="button"
        disabled
        className="px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant/70 font-title-sm text-title-sm cursor-not-allowed"
      >
        {children}
      </button>
      <p className={HINT}>{note}</p>
    </div>
  );
}

function AiNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-space-md bg-secondary-fixed text-on-secondary-fixed rounded-lg flex items-start gap-2">
      <span className="text-secondary mt-0.5">
        <Icon name="auto_awesome" size={16} />
      </span>
      <div className="min-w-0">
        <span className="font-title-sm text-title-sm font-semibold">{title}</span>
        <p className="font-body-sm text-body-sm mt-0.5">{children}</p>
      </div>
    </div>
  );
}

/** Banner "hồ sơ gốc" đầu trang (dùng chung cho mọi bản ngôn ngữ). */
export function ShopGroundTruthBanner({ t }: { t: Translate }) {
  return (
    <div className="flex items-center gap-space-sm p-space-md bg-secondary-fixed text-on-secondary-fixed rounded-xl shadow-sm">
      <span className="text-secondary">
        <Icon name="psychology" size={20} />
      </span>
      <p className="font-body-md text-body-md font-medium">{t('shop.groundTruth')}</p>
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
  const counter = `${profile?.description?.length ?? 0} / 2000`;
  return (
    <div className="space-y-space-xl">
      <section aria-labelledby={p('identity')} className={SECTION}>
        <SectionHead
          id={p('identity')}
          icon="badge"
          title={t('shop.identity.title')}
          subtitle={t('shop.identity.subtitle')}
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-5 space-y-space-md">
            <RealField
              label={t('shop.name')}
              name="name"
              defaultValue={profile?.name}
              required
              maxLength={200}
            />
            <OffField label={t('shop.slogan')} hint={t('shop.soonHint')} />
            <div>
              <span className={LABEL}>{t('shop.industries')}</span>
              <div className="flex flex-wrap items-center gap-2">
                <OffButton note={t('shop.soonHint')}>{t('shop.industriesAdd')}</OffButton>
              </div>
            </div>
            <div className="p-space-md bg-surface-container-low rounded-xl flex items-center gap-space-md">
              <div className="min-w-0">
                <div className="font-title-sm text-title-sm text-on-surface">{t('shop.logo')}</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('shop.logoNote')}
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-7 flex flex-col justify-between space-y-space-sm bg-surface-container-low p-space-lg rounded-xl">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-title-sm text-title-sm text-on-surface flex items-center gap-1.5">
                  <span className="text-secondary">
                    <Icon name="psychology" size={16} />
                  </span>
                  {t('shop.descriptionTitle')}
                </span>
                <span className="font-code-sm text-code-sm text-on-surface-variant">{counter}</span>
              </div>
              <RealField
                label={t('shop.description')}
                name="description"
                rows={9}
                defaultValue={profile?.description}
                hint={t('shop.descriptionHint')}
                maxLength={2000}
              />
            </div>
            <AiNote title={t('shop.aiMechanism.title')}>{t('shop.aiMechanism.body')}</AiNote>
          </div>
        </div>
      </section>

      <section aria-labelledby={p('locations')} className={SECTION}>
        <SectionHead
          id={p('locations')}
          icon="location_on"
          title={t('shop.locations.title')}
          subtitle={t('shop.locations.subtitle')}
        />
        <div className="space-y-space-md">
          <div className="p-space-lg rounded-xl bg-surface-container-low">
            <RealField
              label={t('shop.address')}
              name="address"
              defaultValue={profile?.address}
              maxLength={500}
            />
          </div>
          <div className="p-space-lg rounded-xl bg-surface-container-low">
            <h3 className="font-title-md text-title-md text-on-surface">
              {t('shop.branches.title')}
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('shop.branches.empty')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-space-md pt-2">
            <OffButton note={t('shop.soonHint')}>{t('shop.branches.add')}</OffButton>
            <OffButton note={t('shop.soonHint')}>{t('shop.maps')}</OffButton>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <section
          aria-labelledby={p('hours')}
          className={`lg:col-span-6 ${SECTION} flex flex-col justify-between`}
        >
          <div>
            <SectionHead
              id={p('hours')}
              icon="schedule"
              title={t('shop.hours.title')}
              subtitle={t('shop.hours.subtitle')}
            />
            <div className="space-y-space-md">
              <div className="p-space-md bg-surface-container-low rounded-xl">
                <RealField
                  label={t('shop.openingHours')}
                  name="openingHours"
                  defaultValue={profile?.openingHours}
                  maxLength={500}
                />
              </div>
              <div className="p-space-md bg-surface-container-low rounded-xl">
                <OffField label={t('shop.hours.support')} hint={t('shop.soonHint')} />
              </div>
              <div className="p-space-md bg-secondary-fixed text-on-secondary-fixed rounded-xl space-y-space-sm">
                <OffButton note={t('shop.hours.nightNote')}>{t('shop.hours.night')}</OffButton>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby={p('channels')}
          className={`lg:col-span-6 ${SECTION} flex flex-col justify-between`}
        >
          <div>
            <SectionHead
              id={p('channels')}
              icon="alternate_email"
              title={t('shop.channels.title')}
              subtitle={t('shop.channels.subtitle')}
            />
            <div className="space-y-space-sm">
              <RealField
                label={t('shop.contact')}
                name="contact"
                defaultValue={profile?.contact}
                hint={t('shop.contactHint')}
                maxLength={200}
                icon="call"
              />
              <OffField label={t('shop.channels.zalo')} hint={t('shop.soonHint')} icon="chat" />
              <RealField
                label={t('shop.website')}
                name="website"
                type="url"
                defaultValue={profile?.website}
                maxLength={500}
                icon="language"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm pt-1">
                <OffField label={t('shop.channels.shopee')} />
                <OffField label={t('shop.channels.tiktok')} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby={p('legal')} className={SECTION}>
        <SectionHead
          id={p('legal')}
          icon="corporate_fare"
          title={t('shop.legal.title')}
          subtitle={t('shop.legal.subtitle')}
          right={
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
              {t('shop.soon')}
            </span>
          }
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-5 space-y-space-md">
            <OffField label={t('shop.legal.name')} hint={t('shop.soonHint')} />
            <OffField label={t('shop.legal.taxId')} hint={t('shop.soonHint')} />
          </div>
          <div className="lg:col-span-7 bg-surface-container-low p-space-lg rounded-xl space-y-space-md">
            <span className="font-title-sm text-title-sm text-on-surface flex items-center gap-1.5">
              <span className="text-primary">
                <Icon name="credit_card" size={16} />
              </span>
              {t('shop.legal.bank')}
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('shop.legal.bankNote')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
