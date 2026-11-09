import { PAYMENT_METHODS } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { EditableKind, PolicyFormDefaults } from '../../lib/kb-policy-form';
import { Field, KbCard, SaveButton, SelectField } from './kb-content-ui';

type T = (key: string, values?: Record<string, string | number>) => string;

const REGION_KINDS = ['nationwide', 'city', 'region'] as const;
const FEE_MODES = ['fixed', 'free', 'free_over', 'at_checkout'] as const;
const DAYS_MODES = ['range', 'at_checkout', 'not_stated'] as const;
const COD_OPTIONS = ['yes', 'no', 'unknown'] as const;
const CHECKED = 'on';

const str = (defaults: PolicyFormDefaults, key: string): string => {
  const value = defaults[key];
  return typeof value === 'string' ? value : '';
};

function Check({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} />
      {label}
    </label>
  );
}

const options = (t: T, group: string, keys: readonly string[]) =>
  keys.map((key) => ({ value: key, label: t(`form.${group}.${key}`) }));

/** Giá trị điền sẵn của dòng ship, gom một chỗ (không rải chuỗi chữ trong JSX). */
function shipValues(d: PolicyFormDefaults) {
  return {
    label: str(d, 'label'),
    currency: str(d, 'currency') || 'VND',
    regionKind: str(d, 'regionKind'),
    city: str(d, 'city'),
    places: str(d, 'places'),
    feeMode: str(d, 'feeMode'),
    feeAmount: str(d, 'feeAmount'),
    freeOverAmount: str(d, 'freeOverAmount'),
    daysMode: str(d, 'daysMode'),
    daysMin: str(d, 'daysMin'),
    daysMax: str(d, 'daysMax'),
    cod: str(d, 'cod'),
    destinations: str(d, 'destinations'),
  };
}

function ShipFields({
  d,
  t,
  labelEditable,
}: {
  d: PolicyFormDefaults;
  t: T;
  labelEditable: boolean;
}) {
  const v = shipValues(d);
  const regionOptions = options(t, 'regionKinds', REGION_KINDS);
  const feeOptions = options(t, 'feeModes', FEE_MODES);
  const daysOptions = options(t, 'daysModes', DAYS_MODES);
  const codOptions = options(t, 'codOptions', COD_OPTIONS);
  return (
    <div className="space-y-space-md">
      {labelEditable ? (
        <Field
          label={t('form.label')}
          name="label"
          defaultValue={v.label}
          hint={t('form.labelHint')}
          required
          maxLength={100}
        />
      ) : (
        <>
          <input type="hidden" name="label" value={v.label} />
          <p className="font-title-sm text-title-sm text-on-surface">{v.label}</p>
        </>
      )}
      <input type="hidden" name="currency" value={v.currency} />
      <div className="grid gap-space-md md:grid-cols-3">
        <SelectField
          label={t('form.regionKind')}
          name="regionKind"
          defaultValue={v.regionKind}
          options={regionOptions}
        />
        <Field label={t('form.city')} name="city" defaultValue={v.city} maxLength={100} />
        <Field
          label={t('form.places')}
          name="places"
          defaultValue={v.places}
          hint={t('form.placesHint')}
          rows={3}
        />
      </div>
      <div className="grid gap-space-md md:grid-cols-3">
        <SelectField
          label={t('form.feeMode')}
          name="feeMode"
          defaultValue={v.feeMode}
          options={feeOptions}
        />
        <Field label={t('form.feeAmount')} name="feeAmount" defaultValue={v.feeAmount} />
        <Field
          label={t('form.freeOverAmount')}
          name="freeOverAmount"
          defaultValue={v.freeOverAmount}
        />
      </div>
      <div className="grid gap-space-md md:grid-cols-3">
        <SelectField
          label={t('form.daysMode')}
          name="daysMode"
          defaultValue={v.daysMode}
          options={daysOptions}
        />
        <Field label={t('form.daysMin')} name="daysMin" defaultValue={v.daysMin} />
        <Field label={t('form.daysMax')} name="daysMax" defaultValue={v.daysMax} />
      </div>
      <div className="grid gap-space-md md:grid-cols-2">
        <SelectField label={t('form.cod')} name="cod" defaultValue={v.cod} options={codOptions} />
        <Field
          label={t('form.destinations')}
          name="destinations"
          defaultValue={v.destinations}
          hint={t('form.destinationsHint')}
        />
      </div>
    </div>
  );
}

function returnsValues(d: PolicyFormDefaults) {
  return {
    days: str(d, 'days'),
    none: str(d, 'none') === CHECKED,
    conditions: str(d, 'conditions'),
    refundTo: str(d, 'refundTo'),
    paidBy: str(d, 'returnShippingPaidBy'),
    eligibility: str(d, 'eligibility'),
  };
}

function ReturnsFields({ d, t }: { d: PolicyFormDefaults; t: T }) {
  const v = returnsValues(d);
  const unset = { value: '', label: t('form.unset') };
  const refundOptions = [
    unset,
    { value: 'original_payment', label: t('returns.refund_original_payment') },
  ];
  const paidByOptions = [
    unset,
    { value: 'shop', label: t('returns.paid_shop') },
    { value: 'customer_change_of_mind', label: t('returns.paid_customer_change_of_mind') },
  ];
  const eligibilityOptions = [
    unset,
    { value: 'varies_by_item', label: t('returns.elig_varies_by_item') },
  ];
  return (
    <div className="space-y-space-md">
      <div className="grid gap-space-md md:grid-cols-2">
        <Field label={t('form.returnsDays')} name="days" defaultValue={v.days} />
        <Check name="none" value={CHECKED} label={t('form.returnsNone')} checked={v.none} />
      </div>
      <Field
        label={t('form.conditions')}
        name="conditions"
        defaultValue={v.conditions}
        hint={t('form.conditionsHint')}
        rows={3}
      />
      <div className="grid gap-space-md md:grid-cols-3">
        <SelectField
          label={t('returns.refundTo')}
          name="refundTo"
          defaultValue={v.refundTo}
          options={refundOptions}
        />
        <SelectField
          label={t('returns.shippingPaidBy')}
          name="returnShippingPaidBy"
          defaultValue={v.paidBy}
          options={paidByOptions}
        />
        <SelectField
          label={t('returns.eligibility')}
          name="eligibility"
          defaultValue={v.eligibility}
          options={eligibilityOptions}
        />
      </div>
    </div>
  );
}

function WarrantyFields({ d, t }: { d: PolicyFormDefaults; t: T }) {
  const months = str(d, 'months');
  const none = str(d, 'none') === CHECKED;
  const scope = str(d, 'scope');
  return (
    <div className="space-y-space-md">
      <div className="grid gap-space-md md:grid-cols-2">
        <Field label={t('form.warrantyMonths')} name="months" defaultValue={months} />
        <Check name="none" value={CHECKED} label={t('form.warrantyNone')} checked={none} />
      </div>
      <Field
        label={t('form.scope')}
        name="scope"
        defaultValue={scope}
        hint={t('form.scopeHint')}
        maxLength={200}
      />
    </div>
  );
}

function CodFields({ d, t }: { d: PolicyFormDefaults; t: T }) {
  const codValue = str(d, 'codValue');
  const codOptions = options(t, 'codOptions', ['yes', 'no']);
  return (
    <SelectField
      label={t('form.cod')}
      name="codValue"
      defaultValue={codValue}
      options={codOptions}
    />
  );
}

function PaymentFields({ d, t }: { d: PolicyFormDefaults; t: T }) {
  const picked = Array.isArray(d.methods) ? d.methods : [];
  return (
    <fieldset className="space-y-2">
      <legend className="font-label-md text-label-md text-on-surface">{t('form.methods')}</legend>
      {PAYMENT_METHODS.map((method) => (
        <Check
          key={method}
          name="methods"
          value={method}
          label={t(`payment.${method}`)}
          checked={picked.includes(method)}
        />
      ))}
    </fieldset>
  );
}

/**
 * Biểu mẫu Sửa tay / Thêm giá trị chính sách có cấu trúc (ADR 017). Chưa có thiết kế Stitch riêng cho hộp thoại này (ghi ở `docs/plans/ui-thieu-thiet-ke.md`), dựng bằng thành phần Cơ sở
 * kiến thức sẵn có. `draftId` + `rev` = nháp đang sửa (để phát hiện lệch phiên bản khi lưu); không có = bắt đầu từ bản đã duyệt hoặc thêm mới. Gửi tới Server Action `action`.
 */
export async function PolicyValueForm({
  kind,
  defaults,
  action,
  cancelHref,
  draft,
  labelEditable,
  heading,
  evidence = null,
}: {
  kind: EditableKind;
  defaults: PolicyFormDefaults;
  action: (data: FormData) => Promise<void>;
  cancelHref: string;
  draft: { id: string; rev: number } | null;
  labelEditable: boolean;
  heading: 'edit' | 'add';
  /** Câu gốc trong văn bản mà đề xuất dựa vào (nháp của máy) — để Owner đối chiếu khi sửa. */
  evidence?: string | null;
}): Promise<ReactNode> {
  const translator = await getTranslations('kbPolicyFacts');
  const t = translator as unknown as T;
  const title = `${t(`form.pageTitle.${heading}`)} — ${t(`form.kindTitle.${kind}`)}`;
  const fields =
    kind === 'ship_region' ? (
      <ShipFields d={defaults} t={t} labelEditable={labelEditable} />
    ) : kind === 'cod' ? (
      <CodFields d={defaults} t={t} />
    ) : kind === 'returns' ? (
      <ReturnsFields d={defaults} t={t} />
    ) : kind === 'warranty' ? (
      <WarrantyFields d={defaults} t={t} />
    ) : (
      <PaymentFields d={defaults} t={t} />
    );
  return (
    <KbCard id="policy-value-form" title={title} description={t('form.intro')}>
      <form action={action} className="space-y-space-md">
        <input type="hidden" name="kind" value={kind} />
        {draft ? (
          <>
            <input type="hidden" name="draftId" value={draft.id} />
            <input type="hidden" name="rev" value={draft.rev} />
            <p className="rounded-lg bg-surface-container-low px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">
              {t('form.draftNote')}
            </p>
          </>
        ) : null}
        {evidence ? (
          <blockquote className="rounded-lg bg-secondary-fixed/40 p-space-md font-body-sm text-body-sm italic text-on-surface-variant">
            <span className="mb-1 block font-label-sm text-label-sm not-italic text-secondary">
              {t('evidence.title')}
            </span>
            {`“${evidence}”`}
          </blockquote>
        ) : null}
        {fields}
        <div className="flex items-center justify-end gap-2">
          <a
            href={cancelHref}
            className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-on-surface-variant"
          >
            {t('form.cancel')}
          </a>
          <SaveButton>{t('form.save')}</SaveButton>
        </div>
      </form>
    </KbCard>
  );
}
