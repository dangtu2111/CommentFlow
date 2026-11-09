import { formatMinorAmount, type ShipRegionData } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { PolicyLeftover } from '../../lib/kb-policy-leftover';
import type { PolicyNotice } from '../../lib/kb-policy-notice';
import {
  isEditedByOwner,
  isShipRegionRow,
  needsReview,
  type PolicyCard,
  type PolicyCardView,
  type PolicyCoverage,
  type PolicyEntry,
  type PolicyFactRowView,
  type PolicyFactsView,
} from '../../lib/kb-policy-view';
import { Icon, type IconName } from '../ui/icon';

/** Server Action nhận FormData (Duyệt / Bỏ). Không truyền → nút hiển thị khóa (route [MẪU], chưa nối). */
export type PolicyActions = {
  approve: (data: FormData) => Promise<void>;
  discard: (data: FormData) => Promise<void>;
  remove: (data: FormData) => Promise<void>;
  sync: () => Promise<void>;
};

/** Dữ liệu thô đã nạp (chính sách văn bản); không truyền = không hiển thị (Staff không đọc được). */
/** Kết quả lần đồng bộ Shopify gần nhất (từ `shopify_stores`); null = chưa kết nối. */
export type ShopifySyncStatus = {
  syncedAt: string | null;
  ok: boolean;
  policiesUpdated?: number;
  policiesSkipped?: boolean;
  factsDrafted?: number;
  factsSkipped?: boolean;
};

export type RawPolicySummary = {
  /** Trạng thái đồng bộ Shopify; thiếu = chưa kết nối. */
  sync?: ShopifySyncStatus | null;
  count: number;
  /** Từng văn bản thô (loại, tiêu đề, đoạn đầu) để Owner thấy hệ thống đã nạp gì. */
  items?: ReadonlyArray<{ kind: string; title: string; excerpt: string }>;
};

type T = (key: string, values?: Record<string, string | number>) => string;

const CARD_ICON: Record<PolicyCard, IconName> = {
  ship: 'local_shipping',
  returns: 'policy',
  warranty: 'verified',
  payment: 'payments',
};

const COVERAGE_TONE: Record<PolicyCoverage, string> = {
  approved: 'border-primary-container/30 bg-surface-container-low text-primary',
  draft: 'border-tertiary-fixed-dim bg-tertiary-fixed text-on-tertiary-fixed-variant',
  none: 'border-outline-variant bg-surface-container text-on-surface-variant',
};

const isSuccess = (notice: PolicyNotice): boolean =>
  notice === 'saved' ||
  notice === 'approved' ||
  notice === 'discarded' ||
  notice === 'deleted' ||
  notice === 'sync_queued';

/** Mốc "Cập nhật lúc …" theo giờ Việt Nam; thiếu hoặc sai → không hiện. */
function updatedText(row: PolicyFactRowView, t: T): string | null {
  if (!row.updatedAt) return null;
  const date = new Date(row.updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  return t('updatedAt', { time });
}

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${tone}`}
    >
      {children}
    </span>
  );
}

const CHIP_APPROVED = 'bg-surface-container-low text-primary';
const CHIP_DRAFT = 'bg-tertiary-fixed text-on-tertiary-fixed-variant';
const CHIP_AI = 'bg-secondary-fixed text-on-secondary-fixed';
const CHIP_NEUTRAL = 'bg-surface-container text-on-surface-variant';
const CHIP_WARN = 'bg-error-container text-on-error-container';

/** Chip trạng thái + nguồn + "Đã sửa tay" + "Cần xác nhận điều kiện" của MỘT dòng giá trị. */
function RowChips({ row, t }: { row: PolicyFactRowView; t: T }) {
  const suggested = row.origin !== 'manual';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip tone={row.status === 'approved' ? CHIP_APPROVED : CHIP_DRAFT}>
        {t(`chips.${row.status}`)}
      </Chip>
      <Chip tone={suggested ? CHIP_AI : CHIP_NEUTRAL}>
        {suggested ? <Icon name="auto_awesome" size={12} /> : null}
        {t(`chips.${row.origin}`)}
      </Chip>
      {isEditedByOwner(row) ? <Chip tone={CHIP_NEUTRAL}>{t('chips.editedByOwner')}</Chip> : null}
      {needsReview(row) ? (
        <Chip tone={CHIP_WARN}>
          <Icon name="warning" size={12} />
          {t('chips.needsReview')}
        </Chip>
      ) : null}
      {updatedText(row, t) ? (
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {updatedText(row, t)}
        </span>
      ) : null}
    </div>
  );
}

function money(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '';
  // Đồng Việt Nam: đơn vị nhỏ nhất = đồng ("30.000đ"); ngoại tệ theo số mũ của tiền tệ.
  if (currency === 'VND') return `${minor.toLocaleString('vi-VN')}đ`;
  return formatMinorAmount(minor, currency) ?? `${minor} ${currency}`;
}

function feeText(data: ShipRegionData, t: T): string {
  const mode = data.feeMode ?? (data.feeMinor === null ? null : 'fixed');
  if (mode === 'fixed') {
    return t('ship.fee_fixed', { amount: money(data.feeMinor, data.currency) });
  }
  if (mode === 'free') return t('ship.fee_free');
  if (mode === 'free_over') {
    return t('ship.fee_free_over', { amount: money(data.freeOverMinor, data.currency) });
  }
  if (mode === 'at_checkout') return t('ship.fee_at_checkout');
  return t('ship.fee_unknown');
}

function daysText(data: ShipRegionData, t: T): string {
  const mode = data.daysMode ?? (data.daysMin === null ? 'not_stated' : 'range');
  if (mode === 'at_checkout') return t('ship.days_at_checkout');
  if (mode === 'range' && data.daysMin !== null && data.daysMax !== null) {
    return data.daysMin === data.daysMax
      ? t('ship.days_same', { n: data.daysMin })
      : t('ship.days_range', { min: data.daysMin, max: data.daysMax });
  }
  return t('ship.days_unknown');
}

function areaText(data: ShipRegionData, t: T): string {
  if (data.kind === 'city') return t('ship.areaCity', { city: data.city ?? '' });
  if (data.kind === 'region') return t('ship.areaRegion', { count: (data.places ?? []).length });
  return t('ship.areaNationwide');
}

function destinationText(data: ShipRegionData, t: T): string {
  const codes = data.destinations ?? ['VN'];
  return codes.map((code) => (code === 'VN' ? t('ship.dest_VN') : code)).join(', ');
}

function codText(data: ShipRegionData, t: T): string {
  if (data.cod === true) return t('ship.cod_yes');
  if (data.cod === false) return t('ship.cod_no');
  return t('ship.cod_unknown');
}

/** Một dòng key–value nhỏ dùng cho Đổi trả / Bảo hành. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
        {label}
      </div>
      <div className="mt-0.5 font-title-sm text-title-sm text-on-surface">{children}</div>
    </div>
  );
}

type ReturnsData = {
  days: number | null;
  none?: boolean;
  conditions?: string[];
  refundTo?: 'original_payment' | null;
  returnShippingPaidBy?: 'customer_change_of_mind' | 'shop' | null;
  eligibility?: 'varies_by_item' | null;
};

function ReturnsValue({ data, t }: { data: ReturnsData; t: T }) {
  if (data.none === true) return <p className="font-body-md text-body-md">{t('returns.none')}</p>;
  const conditions = data.conditions ?? [];
  return (
    <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t('returns.days')}>
        {data.days === null ? t('returns.notStated') : t('returns.daysValue', { n: data.days })}
      </Field>
      <Field label={t('returns.conditions')}>
        {conditions.length === 0 ? (
          t('returns.notStated')
        ) : (
          <span className="flex flex-wrap gap-1">
            {conditions.map((condition) => (
              <Chip key={condition} tone={CHIP_NEUTRAL}>
                {condition}
              </Chip>
            ))}
          </span>
        )}
      </Field>
      <Field label={t('returns.shippingPaidBy')}>
        {data.returnShippingPaidBy
          ? t(`returns.paid_${data.returnShippingPaidBy}`)
          : t('returns.notStated')}
      </Field>
      <Field label={t('returns.refundTo')}>
        {data.refundTo ? t(`returns.refund_${data.refundTo}`) : t('returns.notStated')}
        {data.eligibility ? (
          <span className="block font-body-sm text-body-sm text-on-surface-variant">
            {t(`returns.elig_${data.eligibility}`)}
          </span>
        ) : null}
      </Field>
    </div>
  );
}

function WarrantyValue({
  data,
  t,
}: {
  data: { months: number | null; none?: boolean; scope?: string };
  t: T;
}) {
  if (data.none === true) {
    return <p className="font-body-md text-body-md">{t('warranty.none')}</p>;
  }
  return (
    <div className="grid gap-space-md sm:grid-cols-2">
      <Field label={t('warranty.months')}>
        {data.months === null
          ? t('warranty.notStated')
          : t('warranty.monthsValue', { n: data.months })}
      </Field>
      <Field label={t('warranty.scope')}>{data.scope ?? t('warranty.notStated')}</Field>
    </div>
  );
}

function PaymentValue({ data, t }: { data: { methods: string[] }; t: T }) {
  return (
    <div className="flex flex-wrap gap-2">
      {data.methods.map((method) => (
        <Chip key={method} tone={CHIP_APPROVED}>
          {t(`payment.${method}`)}
        </Chip>
      ))}
    </div>
  );
}

/** Giá trị của một dòng (không phải dòng khu vực ship): Đổi trả / Bảo hành / Thanh toán / COD chung. */
function ValueBlock({ row, t }: { row: PolicyFactRowView; t: T }) {
  if (row.kind === 'returns') return <ReturnsValue data={row.data as ReturnsData} t={t} />;
  if (row.kind === 'warranty') {
    return (
      <WarrantyValue
        data={row.data as { months: number | null; none?: boolean; scope?: string }}
        t={t}
      />
    );
  }
  if (row.kind === 'payment')
    return <PaymentValue data={row.data as { methods: string[] }} t={t} />;
  const cod = (row.data as { value: boolean }).value;
  return (
    <p className="font-body-md text-body-md">{`COD: ${cod ? t('ship.cod_yes') : t('ship.cod_no')}`}</p>
  );
}

function DisabledAction({
  children,
  t,
  primary = false,
}: {
  children: ReactNode;
  t: T;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={t('actions.soon')}
      className={`rounded-lg px-3 py-1.5 font-label-md text-label-md opacity-50 ${
        primary ? 'bg-primary-container text-on-primary' : 'bg-surface-container text-primary'
      }`}
    >
      {children}
    </button>
  );
}

const EDIT_PAGE = '/app/kb/policies/edit';
const KIND_OF_CARD: Record<PolicyCard, string> = {
  ship: 'ship_region',
  returns: 'returns',
  warranty: 'warranty',
  payment: 'payment',
};

/** Liên kết tới biểu mẫu Sửa tay/Thêm (chỉ Owner, khi đã nối thao tác). */
function LinkAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-primary"
    >
      {children}
    </a>
  );
}

/** Khối nháp chờ duyệt (đề xuất của máy hoặc bản Owner đã sửa): giá trị mới, trích dẫn nguyên văn, so với bản đang duyệt, nút thao tác. */
function DraftBlock({
  entry,
  isOwner,
  actions,
  t,
}: {
  entry: PolicyEntry;
  isOwner: boolean;
  actions: PolicyActions | undefined;
  t: T;
}) {
  const draft = entry.draft;
  if (draft === null) return null;
  return (
    <div className="mt-space-md space-y-space-md rounded-xl border-2 border-secondary-container/60 bg-secondary-fixed/30 p-space-md">
      <RowChips row={draft} t={t} />
      <div>
        <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          {t('proposed.title')}
        </div>
        <div className="mt-1">
          {isShipRegionRow(draft) ? (
            <ShipSummary data={draft.data as ShipRegionData} t={t} />
          ) : (
            <ValueBlock row={draft} t={t} />
          )}
        </div>
      </div>
      {draft.evidence ? (
        <blockquote className="rounded-lg bg-surface-container-lowest p-space-md font-body-sm text-body-sm italic text-on-surface-variant">
          <span className="mb-1 block font-label-sm text-label-sm not-italic text-secondary">
            {t('evidence.title')}
          </span>
          {`“${draft.evidence}”`}
        </blockquote>
      ) : null}
      <div className="rounded-lg bg-surface-container-lowest p-space-md font-body-sm text-body-sm text-on-surface-variant">
        <span className="block font-label-sm text-label-sm uppercase tracking-wider">
          {t('current.title')}
        </span>
        {entry.approved === null ? (
          <span className="italic">{t('current.none')}</span>
        ) : isShipRegionRow(entry.approved) ? (
          <ShipSummary data={entry.approved.data as ShipRegionData} t={t} />
        ) : (
          <ValueBlock row={entry.approved} t={t} />
        )}
      </div>
      {isOwner && actions ? (
        <form className="space-y-space-md">
          <input type="hidden" name="id" value={draft.id} />
          <input type="hidden" name="rev" value={draft.rev} />
          {needsReview(draft) ? (
            <label className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface">
              <input type="checkbox" name="confirm" required className="mt-0.5" />
              {t('confirm')}
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="submit"
              formAction={actions.discard}
              formNoValidate
              className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-on-surface-variant"
            >
              {t('actions.discard')}
            </button>
            <LinkAction href={`${EDIT_PAGE}?kind=${draft.kind}&id=${draft.id}`}>
              {t('actions.edit')}
            </LinkAction>
            <button
              type="submit"
              formAction={actions.approve}
              className="rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-label-md text-on-primary"
            >
              {t('actions.approve')}
            </button>
          </div>
        </form>
      ) : (
        <>
          {needsReview(draft) ? (
            <label className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface">
              <input type="checkbox" disabled className="mt-0.5" />
              {t('confirm')}
            </label>
          ) : null}
          {isOwner ? (
            <div className="flex flex-wrap justify-end gap-2">
              <DisabledAction t={t}>{t('actions.discard')}</DisabledAction>
              <DisabledAction t={t}>{t('actions.edit')}</DisabledAction>
              <DisabledAction t={t} primary>
                {t('actions.approve')}
              </DisabledAction>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ShipSummary({ data, t }: { data: ShipRegionData; t: T }) {
  return (
    <dl className="grid gap-x-space-lg gap-y-1 font-body-md text-body-md sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt className="font-label-sm text-label-sm text-on-surface-variant">{t('ship.area')}</dt>
        <dd>{areaText(data, t)}</dd>
      </div>
      <div>
        <dt className="font-label-sm text-label-sm text-on-surface-variant">{t('ship.fee')}</dt>
        <dd>{feeText(data, t)}</dd>
      </div>
      <div>
        <dt className="font-label-sm text-label-sm text-on-surface-variant">{t('ship.time')}</dt>
        <dd>{daysText(data, t)}</dd>
      </div>
      <div>
        <dt className="font-label-sm text-label-sm text-on-surface-variant">
          {t('ship.destination')}
        </dt>
        <dd>{destinationText(data, t)}</dd>
      </div>
      <div>
        <dt className="font-label-sm text-label-sm text-on-surface-variant">{t('ship.cod')}</dt>
        <dd>{codText(data, t)}</dd>
      </div>
    </dl>
  );
}

/** Một mục của thẻ: bản đang duyệt (nếu có) + khối nháp chờ duyệt (nếu có). Chỉ có nháp → chỉ hiện khối nháp. */
function EntryRow({
  entry,
  isOwner,
  actions,
  t,
}: {
  entry: PolicyEntry;
  isOwner: boolean;
  actions: PolicyActions | undefined;
  t: T;
}) {
  const { approved, draft } = entry;
  const shown = approved ?? draft;
  if (shown === null) return null;
  const heading = isShipRegionRow(shown) ? (shown.data as ShipRegionData).label : null;
  return (
    <div className="rounded-xl bg-surface-container-low p-space-md">
      {heading ? <h3 className="font-title-sm text-title-sm text-on-surface">{heading}</h3> : null}
      {approved ? (
        <div className="mt-2 space-y-2">
          <RowChips row={approved} t={t} />
          {isShipRegionRow(approved) ? (
            <ShipSummary data={approved.data as ShipRegionData} t={t} />
          ) : (
            <ValueBlock row={approved} t={t} />
          )}
          {isOwner ? (
            <div className="flex justify-end gap-2">
              {actions ? (
                <>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-error">
                      {t('actions.delete')}
                    </summary>
                    <form className="absolute right-0 z-10 mt-1 rounded-lg bg-surface-container-lowest p-space-sm shadow-lg">
                      <input type="hidden" name="id" value={approved.id} />
                      <input type="hidden" name="rev" value={approved.rev} />
                      <button
                        type="submit"
                        formAction={actions.remove}
                        className="whitespace-nowrap rounded-lg bg-error px-3 py-1.5 font-label-md text-label-md text-on-error"
                      >
                        {t('actions.deleteConfirm')}
                      </button>
                    </form>
                  </details>
                  <LinkAction href={`${EDIT_PAGE}?kind=${approved.kind}&id=${approved.id}`}>
                    {t('actions.edit')}
                  </LinkAction>
                </>
              ) : (
                <DisabledAction t={t}>{t('actions.edit')}</DisabledAction>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <DraftBlock entry={entry} isOwner={isOwner} actions={actions} t={t} />
    </div>
  );
}

function CardShell({
  view,
  isOwner,
  actions,
  t,
  children,
  leftover = [],
}: {
  view: PolicyCardView;
  isOwner: boolean;
  actions: PolicyActions | undefined;
  t: T;
  children: ReactNode;
  leftover?: LeftoverList;
}) {
  const id = `policy-card-${view.card}`;
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm space-y-space-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-space-md">
        <div className="flex items-start gap-space-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-primary">
            <Icon name={CARD_ICON[view.card]} size={20} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={id} className="font-title-md text-title-md text-on-surface">
                {t(`cards.${view.card}.title`)}
              </h2>
              <Chip tone={COVERAGE_TONE[view.coverage]}>{t(`coverage.${view.coverage}`)}</Chip>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t(`cards.${view.card}.desc`)}
            </p>
          </div>
        </div>
        {isOwner ? (
          actions ? (
            <LinkAction href={`${EDIT_PAGE}?kind=${KIND_OF_CARD[view.card]}`}>
              {view.card === 'ship' ? t('actions.addRegion') : t('actions.add')}
            </LinkAction>
          ) : (
            <DisabledAction t={t}>
              {view.card === 'ship' ? t('actions.addRegion') : t('actions.add')}
            </DisabledAction>
          )
        ) : null}
      </div>
      {children}
      <LeftoverBlock sentences={leftover} t={t} />
    </section>
  );
}

type LeftoverList = PolicyLeftover['byCard']['ship'];

/** Câu trong dữ liệu thô chưa thành giá trị có cấu trúc (gập lại; chỉ Owner thấy vì văn bản thô chỉ Owner đọc). */
function LeftoverBlock({ sentences, t }: { sentences: LeftoverList; t: T }) {
  if (sentences.length === 0) return null;
  return (
    <details className="rounded-xl bg-surface-container-low p-space-md">
      <summary className="cursor-pointer font-label-md text-label-md text-on-surface-variant">
        {t('leftover.title', { count: sentences.length })}
      </summary>
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
        {t('leftover.hint')}
      </p>
      <ul className="mt-space-sm space-y-space-sm">
        {sentences.map((item) => (
          <li
            key={`${item.title}-${item.sentence}`}
            className="rounded-lg bg-surface-container-lowest p-space-sm font-body-sm text-body-sm text-on-surface"
          >
            <span className="block font-label-sm text-label-sm text-on-surface-variant">
              {item.title}
            </span>
            {item.sentence}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EmptyState({ t }: { t: T }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant p-space-lg text-center">
      <p className="font-title-sm text-title-sm text-on-surface">{t('empty.title')}</p>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{t('empty.body')}</p>
    </div>
  );
}

/** Các dòng trạng thái đồng bộ Shopify (chưa kết nối / chưa đồng bộ / lỗi / số chính sách đã nạp và số giá trị đã tự rút). */
function syncStatusLines(raw: RawPolicySummary, t: T): string[] {
  const sync = raw.sync;
  if (!sync) return [t('raw.notConnected')];
  if (sync.syncedAt === null) return [t('raw.neverSynced')];
  const date = new Date(sync.syncedAt);
  const time = Number.isNaN(date.getTime())
    ? sync.syncedAt
    : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const lines = [t('raw.lastSync', { time })];
  if (!sync.ok) return [...lines, t('raw.syncFailed')];
  if (sync.policiesSkipped) return [...lines, t('raw.policiesSkipped')];
  lines.push(t('raw.policiesLoaded', { count: sync.policiesUpdated ?? raw.count }));
  if (sync.factsSkipped) lines.push(t('raw.factsSkipped'));
  else if (sync.factsDrafted === undefined) lines.push(t('raw.resyncHint'));
  else if (sync.factsDrafted > 0) lines.push(t('raw.factsDrafted', { count: sync.factsDrafted }));
  else lines.push(t('raw.factsNone'));
  return lines;
}

/** Dữ liệu thô từ Shopify: trạng thái lần đồng bộ gần nhất (việc phân tách do job đồng bộ làm), số văn bản thô và nút Đồng bộ lại (Owner). */
function RawDataCard({
  raw,
  isOwner,
  actions,
  t,
}: {
  raw: RawPolicySummary;
  isOwner: boolean;
  actions: PolicyActions | undefined;
  t: T;
}) {
  const status = syncStatusLines(raw, t);
  return (
    <section
      aria-labelledby="policy-raw-data"
      className="flex flex-wrap items-center justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm"
    >
      <div className="max-w-3xl space-y-1">
        <h2 id="policy-raw-data" className="font-title-md text-title-md text-on-surface">
          {t('raw.title')}
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t('raw.body')}</p>
        <ul className="font-label-md text-label-md text-primary">
          {status.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {isOwner && raw.sync ? (
        actions ? (
          <form action={actions.sync}>
            <button
              type="submit"
              className="rounded-lg bg-secondary-container px-3 py-1.5 font-label-md text-label-md text-on-secondary-container"
            >
              {t('raw.resync')}
            </button>
          </form>
        ) : (
          <DisabledAction t={t}>{t('raw.resync')}</DisabledAction>
        )
      ) : null}
      {isOwner && raw.items && raw.items.length > 0 ? (
        <details className="basis-full">
          <summary className="cursor-pointer font-label-md text-label-md text-primary">
            {t('raw.list')}
          </summary>
          <ul className="mt-space-sm space-y-space-sm">
            {raw.items.map((item) => (
              <li
                key={`${item.kind}-${item.title}`}
                className="rounded-lg bg-surface-container-low p-space-md"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={CHIP_NEUTRAL}>{t(`raw.kinds.${item.kind}`)}</Chip>
                  <span className="font-title-sm text-title-sm text-on-surface">{item.title}</span>
                </div>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {item.excerpt}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function CoverageStrip({ view, t }: { view: PolicyFactsView; t: T }) {
  return (
    <div className="space-y-space-sm border-t border-outline-variant/40 pt-space-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          {t('coverage.title')}
        </h2>
        <p className="font-body-sm text-body-sm italic text-on-surface-variant">
          {t('coverage.hint')}
        </p>
      </div>
      <ul className="grid gap-space-sm sm:grid-cols-2 lg:grid-cols-4">
        {view.cards.map((card) => (
          <li
            key={card.card}
            className={`flex items-center justify-between gap-2 rounded-xl border p-space-md ${COVERAGE_TONE[card.coverage]}`}
          >
            <span className="flex items-center gap-2 font-title-sm text-title-sm">
              <Icon name={CARD_ICON[card.card]} size={18} />
              {t(`coverage.${card.card}`)}
            </span>
            <span className="font-label-sm text-label-sm">{t(`coverage.${card.coverage}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Trang "Chính sách có cấu trúc" (ADR 017), bản CHỈ ĐỌC dựng theo design/stitch/kb-policies-structured.*: Owner thấy nút (khóa, "Sắp có"), Staff chỉ xem. Dữ liệu là `policy_facts` thật. */
export async function PolicyFactsPanel({
  view,
  isOwner,
  actions,
  notice = null,
  raw,
  leftover,
}: {
  view: PolicyFactsView;
  isOwner: boolean;
  actions?: PolicyActions;
  notice?: PolicyNotice | null;
  raw?: RawPolicySummary;
  leftover?: PolicyLeftover;
}) {
  const translator = await getTranslations('kbPolicyFacts');
  const t = translator as unknown as T;
  return (
    <div className="space-y-space-lg">
      {notice ? (
        <p
          role={isSuccess(notice) ? 'status' : 'alert'}
          className={`rounded-lg px-space-md py-space-sm font-body-md text-body-md ${
            isSuccess(notice)
              ? 'bg-surface-container-low text-primary'
              : 'bg-error-container text-on-error-container'
          }`}
        >
          {t(`notice.${notice}`)}
        </p>
      ) : null}
      <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm space-y-space-md">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-headline-md text-headline-md text-on-surface">{t('title')}</h1>
              <Chip tone={CHIP_APPROVED}>
                <Icon name="verified" size={12} />
                {t('onlyApproved')}
              </Chip>
            </div>
            <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
              {t('subtitle')}
            </p>
          </div>
          <p
            className="flex items-center gap-2 rounded-lg bg-surface-container-low px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant"
            role="note"
          >
            <Icon name={isOwner ? 'verified' : 'lock'} size={16} />
            {isOwner ? t('roleOwner') : t('roleStaff')}
          </p>
        </div>
        <CoverageStrip view={view} t={t} />
        {view.pendingCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-space-md rounded-xl border border-secondary-container/40 bg-secondary-fixed/40 p-space-md">
            <div className="flex items-start gap-space-md">
              <Icon name="auto_awesome" size={20} className="mt-0.5 text-secondary" />
              <div>
                <p className="font-title-sm text-title-sm text-on-secondary-fixed">
                  {t('banner.title', { count: view.pendingCount })}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('banner.body')}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </section>
      {raw ? <RawDataCard raw={raw} isOwner={isOwner} actions={actions} t={t} /> : null}
      {view.cards.map((card) => (
        <CardShell
          key={card.card}
          view={card}
          isOwner={isOwner}
          actions={actions}
          t={t}
          leftover={leftover?.byCard[card.card]}
        >
          {card.entries.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div className="space-y-space-md">
              {card.entries.map((entry) => (
                <EntryRow
                  key={entry.slot}
                  entry={entry}
                  isOwner={isOwner}
                  actions={actions}
                  t={t}
                />
              ))}
            </div>
          )}
        </CardShell>
      ))}
      {leftover && leftover.byCard.other.length > 0 ? (
        <section
          aria-labelledby="policy-card-other"
          className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm space-y-space-md"
        >
          <div>
            <h2 id="policy-card-other" className="font-title-md text-title-md text-on-surface">
              {t('leftover.otherTitle')}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('leftover.otherDesc')}
            </p>
          </div>
          <LeftoverBlock sentences={leftover.byCard.other} t={t} />
        </section>
      ) : null}
    </div>
  );
}
