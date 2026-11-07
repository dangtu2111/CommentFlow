import { CONTENT_LANGS, VOICE_LANGS } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, useId } from 'react';
import type { KbNotice } from '../../app/app/(guarded)/kb/actions';
import { cn } from '../../lib/cn';
import { TwSubmit } from '../settings/tw/dialog';

/**
 * Thành phần dùng chung cho các trang nhập kiến thức tay (Thông tin cửa hàng, Chính sách, FAQ, Giọng văn). Trình bày
 * thuần bằng Tailwind (bọc trong `.tw`); dữ liệu và quyền do trang/Server Action quyết định.
 */
const NOTICES = [
  'saved',
  'deleted',
  'invalid',
  'not_found',
  'unavailable',
  'rate_limited',
] as const;

/** Mã thông báo `?n=` hợp lệ hoặc `null` (bỏ qua giá trị lạ). */
export function kbNoticeOf(value: string | string[] | undefined): KbNotice | null {
  const v = Array.isArray(value) ? value[0] : value;
  return NOTICES.find((code) => code === v) ?? null;
}

const INPUT =
  'w-full rounded-lg bg-surface-container px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60';
const LABEL = 'block font-title-sm text-title-sm text-on-surface';

export async function KbNoticeBanner({ notice }: { notice: KbNotice | null }) {
  if (!notice) return null;
  const t = await getTranslations('kbContent');
  const ok = notice === 'saved' || notice === 'deleted';
  return (
    <p
      role={ok ? 'status' : 'alert'}
      className={cn(
        'rounded-lg px-3 py-2 font-body-md text-body-md',
        ok ? 'bg-[#EBF7ED] text-[#237A36]' : 'bg-error-container text-on-error-container',
      )}
    >
      {t(`notice.${notice}`)}
    </p>
  );
}

export function KbPageHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header>
      <h1 className="font-headline-md text-headline-md text-on-surface">{title}</h1>
      <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
    </header>
  );
}

export function KbCard({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm space-y-space-md"
    >
      <div>
        <h2 id={id} className="font-title-md text-title-md text-on-surface">
          {title}
        </h2>
        {description ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Ô nhập: nhãn riêng; chú thích nằm NGOÀI nhãn (nối bằng `aria-describedby`) để tên truy cập chỉ là nhãn. */
export function Field({
  label,
  name,
  defaultValue,
  hint,
  rows,
  required,
  type = 'text',
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  hint?: string;
  rows?: number;
  required?: boolean;
  type?: 'text' | 'url';
  maxLength?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const common = {
    id,
    name,
    required,
    maxLength,
    defaultValue: defaultValue ?? '',
    className: INPUT,
    'aria-describedby': hint ? hintId : undefined,
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {rows ? <textarea rows={rows} {...common} /> : <input type={type} {...common} />}
      {hint ? (
        <span id={hintId} className="block font-body-sm text-body-sm text-on-surface-variant">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} className={INPUT}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Ngôn ngữ áp dụng: vi / en / cả hai (`all`), hoặc chỉ vi / en (giọng văn). */
export async function LangSelect({
  name = 'lang',
  defaultValue,
  voice = false,
}: {
  name?: string;
  defaultValue: string;
  voice?: boolean;
}) {
  const t = await getTranslations('kbContent');
  const langs = voice ? VOICE_LANGS : CONTENT_LANGS;
  return (
    <SelectField
      label={t('langLabel')}
      name={name}
      defaultValue={defaultValue}
      options={langs.map((lang) => ({ value: lang, label: t(`lang.${lang}`) }))}
    />
  );
}

export function SaveButton({ children }: { children: ReactNode }) {
  return <TwSubmit tone="primary">{children}</TwSubmit>;
}

export function DeleteButton({ children }: { children: ReactNode }) {
  return <TwSubmit tone="danger-ghost">{children}</TwSubmit>;
}
