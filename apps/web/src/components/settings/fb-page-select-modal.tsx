'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  cancelConnectAction,
  connectPagesAction,
  disconnectSystemUserAction,
  saveSystemTokenAction,
} from '../../app/app/(guarded)/channels/actions';
import { cn } from '../../lib/cn';
import {
  filterPages,
  type RowState,
  rowState,
  type SelectablePage,
  selectionState,
} from '../../lib/fb-page-select';
import { Icon } from '../ui/icon';
import { TwDialog } from './tw/dialog';
import { twBtn } from './tw/ui';

/**
 * Hộp thoại "Chọn Fanpage kết nối vào Workspace" dựng theo Stitch (`Cài đặt - Modal chọn Fanpage kết nối`). CHỈ dữ liệu THẬT: danh sách Page, trạng thái đã kết nối, vai trò quản lý,
 * hạn mức kênh, quyền Meta đã cấp. Không có ảnh đại diện/số người theo dõi/danh mục/tên Business Manager (Meta không trả ở bước này) và không bịa. Chọn Page là biểu mẫu thường
 * (Server Action `connectPagesAction` kiểm lại mọi thứ ở server); ô tìm/đếm hạn mức chỉ là tiện ích phía trình duyệt.
 */
export const FB_SELECT_DIALOG_ID = 'fb-select-modal';

export type FbSelectPermissions = {
  sufficient: boolean;
  missing: string[];
  /** Token người dùng còn hiệu lực theo Meta. */
  tokenValid: boolean;
};

export function FbPageSelectModal({
  pages,
  used,
  limit,
  permissions,
  rerequestHref,
  switchAccountHref,
  refreshHref,
  source,
  systemStatus,
}: {
  pages: SelectablePage[];
  /** Số kênh Facebook đang dùng (chưa bị ngắt) của workspace. */
  used: number;
  limit: number;
  permissions: FbSelectPermissions | null;
  rerequestHref: string;
  switchAccountHref: string;
  refreshHref: string;
  /** `system` = Page lấy bằng token System User đã lưu; `oauth` = đăng nhập Facebook. */
  source: 'oauth' | 'system';
  /** Trạng thái token System User của workspace; `null` = chưa lưu. */
  systemStatus: 'connected' | 'invalid' | 'disconnected' | null;
}) {
  const t = useTranslations('channels');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const visible = filterPages(pages, query);
  const state = selectionState({ selected, used, limit });
  const systemSelectHref = `${refreshHref.split('&src=')[0]}&src=system`;
  const usedPercent = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const nextPercent = Math.min(
    100 - usedPercent,
    Math.round((state.count / Math.max(1, limit)) * 100),
  );

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <TwDialog
      dialogId={FB_SELECT_DIALOG_ID}
      title={t('select.title')}
      description={t('select.subtitle')}
      icon={<Icon name="hub" size={22} />}
      size="xl"
      defaultOpen
    >
      <form action={connectPagesAction} className="space-y-space-md">
        {source === 'system' ? <input type="hidden" name="source" value="system" /> : null}
        {selected.map((id) => (
          <input key={id} type="hidden" name="page" value={id} />
        ))}

        {permissions ? (
          <div
            className={cn(
              'rounded-lg p-space-md flex items-center justify-between gap-space-md flex-wrap',
              permissions.sufficient ? 'bg-primary-fixed/50' : 'bg-tertiary-fixed/40',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={permissions.sufficient ? 'text-primary' : 'text-tertiary'}>
                <Icon name={permissions.sufficient ? 'verified_user' : 'warning'} size={18} />
              </span>
              <p className="font-body-sm text-body-sm text-on-surface">
                {permissions.sufficient
                  ? t('permissions.pickOk')
                  : t('permissions.pickMissing', {
                      list: permissions.missing
                        .map((name) => t(`permissions.perm.${name}.name`))
                        .join(', '),
                    })}
              </p>
            </div>
            {permissions.sufficient ? null : (
              <a href={rerequestHref} className={twBtn({ tone: 'primary' })}>
                <Icon name="lock_reset" size={16} />
                {t('permissions.grant')}
              </a>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-space-sm flex-wrap">
          <a
            href={switchAccountHref}
            className="font-label-md text-label-md text-primary hover:underline"
          >
            {t('select.switchAccount')}
          </a>
          {permissions?.tokenValid ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-low text-primary font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container" aria-hidden="true" />
              {t('select.oauthValid')}
            </span>
          ) : null}
        </div>

        <div className="rounded-lg bg-surface-container-low p-space-md space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-title-sm text-title-sm text-on-surface flex items-center gap-2">
              <Icon name="hub" size={16} />
              {t('select.quota')}
            </span>
            <span className="font-title-sm text-title-sm text-on-surface">
              {t('select.quotaUsed', { used, limit })}
              {state.count > 0 ? (
                <span className="ml-1 text-secondary font-semibold">
                  {t('select.quotaPending', { count: state.count })}
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden flex">
            <div className="h-full bg-primary-container" style={{ width: `${usedPercent}%` }} />
            <div className="h-full bg-secondary-container" style={{ width: `${nextPercent}%` }} />
          </div>
          {state.overLimit ? (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {t('select.overLimit', { limit })}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-space-sm flex-wrap">
          <label className="relative block w-full max-w-sm">
            <span className="sr-only">{t('select.search')}</span>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('select.search')}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:bg-surface-container-lowest focus:shadow-sm"
            />
          </label>
          <a
            href={refreshHref}
            className="inline-flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="sync" size={16} />
            {t('select.refresh')}
          </a>
        </div>

        <ul className="max-h-[340px] overflow-y-auto space-y-2.5">
          {pages.length === 0 ? (
            <li className="rounded-xl bg-surface-container-low p-space-md space-y-1">
              <p className="font-title-sm text-title-sm text-on-surface">{t('pick.empty')}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('select.emptyHint')}
              </p>
            </li>
          ) : null}
          {pages.length > 0 && visible.length === 0 ? (
            <li className="font-body-sm text-body-sm text-on-surface-variant">
              {t('select.noMatch')}
            </li>
          ) : null}
          {visible.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              state={rowState(page)}
              checked={selected.includes(page.id)}
              onToggle={() => toggle(page.id)}
            />
          ))}
        </ul>

        <details
          className="rounded-lg bg-surface-container-low p-space-md"
          open={source === 'system' || pages.length === 0}
        >
          <summary className="cursor-pointer font-title-sm text-title-sm text-on-surface flex items-center gap-2">
            <Icon name="key" size={16} />
            {t('systemUser.title')}
          </summary>
          <div className="mt-space-sm space-y-space-sm">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('systemUser.hint')}
            </p>
            {systemStatus === 'connected' ? (
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-label-sm text-label-sm">
                  <Icon name="check_circle" size={14} />
                  {t('systemUser.saved')}
                </span>
                {source === 'system' ? null : (
                  <a href={systemSelectHref} className={twBtn({ tone: 'primary' })}>
                    {t('systemUser.use')}
                  </a>
                )}
                <button
                  type="submit"
                  formAction={disconnectSystemUserAction}
                  formNoValidate
                  className={twBtn({ tone: 'soft' })}
                >
                  {t('systemUser.disconnect')}
                </button>
              </div>
            ) : (
              <>
                {systemStatus === 'invalid' ? (
                  <p role="alert" className="font-body-sm text-body-sm text-error">
                    {t('systemUser.invalidSaved')}
                  </p>
                ) : null}
                <label className="block space-y-1">
                  <span className="font-label-md text-label-md text-on-surface">
                    {t('systemUser.tokenLabel')}
                  </span>
                  <input
                    type="password"
                    name="systemToken"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-container-lowest font-code-sm text-code-sm text-on-surface outline-none focus:shadow-sm"
                  />
                </label>
                <button
                  type="submit"
                  formAction={saveSystemTokenAction}
                  formNoValidate
                  className={twBtn({ tone: 'primary' })}
                >
                  <Icon name="lock" size={16} />
                  {t('systemUser.save')}
                </button>
              </>
            )}
          </div>
        </details>

        <div className="rounded-lg bg-surface-container-low p-space-md space-y-2">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
            <Icon name="tune" size={14} />
            {t('select.afterTitle')}
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
            <label className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-container-lowest opacity-60 cursor-not-allowed">
              <input type="checkbox" disabled className="mt-0.5 w-4 h-4" />
              <span>
                <span className="block font-title-sm text-title-sm text-on-surface">
                  {t('select.backfill')}
                </span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  {t('select.backfillHint')} · {t('hub.soon')}
                </span>
              </span>
            </label>
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-container-lowest">
              <span className="mt-0.5 text-primary">
                <Icon name="verified_user" size={16} />
              </span>
              <span>
                <span className="block font-title-sm text-title-sm text-on-surface">
                  {t('select.safeMode')}
                </span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  {t('select.safeModeHint')}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-xs">
          <p className="font-title-sm text-title-sm text-on-surface">
            {t('select.selected', { count: state.count })}
            <span className="ml-1 font-normal text-on-surface-variant">
              {t('select.remaining', { remaining: state.remaining, limit })}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              formAction={cancelConnectAction}
              formNoValidate
              className={twBtn({ tone: 'soft' })}
            >
              {t('pick.cancel')}
            </button>
            <button
              type="submit"
              disabled={!state.canSubmit}
              className={twBtn({ tone: 'primary' })}
            >
              <Icon name="add_link" size={16} />
              {t('select.confirm', { count: state.count })}
            </button>
          </div>
        </div>
        <p className="text-center font-label-sm text-label-sm text-on-surface-variant flex items-center justify-center gap-1.5">
          <Icon name="verified_user" size={12} />
          {t('select.compliance')}
        </p>
      </form>
    </TwDialog>
  );
}

function PageRow({
  page,
  state,
  checked,
  onToggle,
}: {
  page: SelectablePage;
  state: RowState;
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('channels');
  const initial = page.name.trim().charAt(0).toUpperCase() || '?';
  const inner = (
    <>
      <div className="flex items-start gap-3.5 min-w-0">
        <div className="pt-0.5">
          <input
            id={`fb-page-${page.id}`}
            type="checkbox"
            checked={state === 'connected' ? true : checked}
            disabled={state !== 'selectable'}
            onChange={onToggle}
            className="w-4 h-4 accent-primary"
          />
        </div>
        <span className="relative shrink-0 size-11 rounded-lg bg-primary-fixed text-primary grid place-items-center font-title-md text-title-md">
          {initial}
          <span
            className="absolute -bottom-1 -right-1 size-4 rounded-full bg-[#1877F2] text-white grid place-items-center"
            aria-hidden="true"
          >
            <Icon name="public" size={10} />
          </span>
        </span>
        <div className="min-w-0 space-y-1">
          <label
            htmlFor={`fb-page-${page.id}`}
            className={cn(
              'block font-title-md text-title-md text-on-surface break-words',
              state === 'selectable' && 'cursor-pointer',
            )}
          >
            {page.name}
          </label>
          <div className="font-code-sm text-code-sm text-on-surface-variant">
            {t('select.pageId', { id: page.id })}
          </div>
          {state === 'blocked' ? (
            <div className="flex items-center gap-1 font-body-sm text-body-sm text-tertiary-container">
              <Icon name="warning" size={14} />
              {t('pick.noPermission')}
            </div>
          ) : null}
        </div>
      </div>
      <span
        className={cn(
          'shrink-0 px-2.5 py-1 rounded-full font-label-sm text-label-sm',
          state === 'selectable' && 'bg-primary-fixed text-on-primary-fixed-variant font-semibold',
          state === 'connected' && 'bg-surface-container-high text-on-surface-variant',
          state === 'blocked' && 'bg-surface-container-highest text-on-surface-variant',
        )}
      >
        {t(`select.state.${state}`)}
      </span>
    </>
  );
  return (
    <li
      className={cn(
        'flex items-start justify-between gap-3 p-3.5 rounded-xl transition-colors',
        state === 'selectable'
          ? checked
            ? 'bg-surface-container-lowest shadow-sm'
            : 'bg-surface-container-lowest hover:bg-surface-container-low'
          : 'bg-surface-container-low/60 opacity-70',
      )}
    >
      {inner}
    </li>
  );
}
