'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useActionState, useCallback, useEffect, useState } from 'react';
import {
  beginTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
} from '../../app/app/security/actions';
import { cn } from '../../lib/cn';
import { SECURITY_IDLE, type SecurityState } from '../../lib/security-form';
import { enrollStep } from '../../lib/settings-visual';
import { showEnableFlow } from '../../lib/two-factor-view';
import { TwDialog, TwDialogTrigger, TwSubmit } from '../settings/tw/dialog';
import { TwBanner, TwCodeField, TwPasswordField } from '../settings/tw/fields';
import { TwCard, TwCardHead, TwChip, TwSoonButton, twBtn } from '../settings/tw/ui';
import { Icon } from '../ui/icon';

const SETUP_ID = 'two-factor-setup-dialog';
const REGEN_ID = 'two-factor-regen-dialog';
const DISABLE_ID = 'two-factor-disable-dialog';
const MASKED_SLOTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

const TITLE_ID = 'two-factor-title';
const MASKED_CODE = '••••-••••';
const TONE_PRIMARY = 'text-primary';
const TONE_SECONDARY = 'text-secondary';

type StepState = 'done' | 'current' | 'todo';
const stepState = (n: number, current: number): StepState => {
  if (n < current) return 'done';
  return n === current ? 'current' : 'todo';
};

function useError(state: SecurityState): string | undefined {
  const t = useTranslations('auth.errors');
  return state.status === 'error'
    ? t(state.message, { minutes: state.retryMinutes ?? 15 })
    : undefined;
}

/** Thanh ba bước của trình hướng dẫn bật 2FA (bước đã qua có dấu tích, bước hiện tại nổi bật) — `settings-2fa-setup-modal`. */
export function EnrollStepper({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations('auth.security.twoFactor.steps');
  return (
    <ol
      aria-label={t('label')}
      className="grid grid-cols-3 gap-2 p-space-sm rounded-xl bg-surface-container-low"
    >
      {([1, 2, 3] as const).map((n) => {
        const state = stepState(n, step);
        return (
          <li
            key={n}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg',
              state === 'done' && 'bg-surface-container-lowest shadow-sm',
              state === 'current' && 'bg-primary-container/10',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center font-code-sm text-code-sm font-bold shrink-0',
                state === 'done' && 'bg-primary-container text-on-primary',
                state === 'current' && 'bg-primary text-on-primary',
                state === 'todo' && 'bg-surface-container-highest text-on-surface-variant',
              )}
            >
              {state === 'done' ? <Icon name="check" size={14} /> : n}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block font-label-sm text-label-sm uppercase tracking-wider truncate',
                  state === 'todo' ? 'text-on-surface-variant' : 'text-primary font-bold',
                )}
              >
                {t('step', { n })}
              </span>
              <span
                className={cn(
                  'block font-title-sm text-title-sm truncate',
                  state === 'todo' ? 'text-on-surface-variant' : 'text-on-surface',
                )}
              >
                {t(`name.${n}`)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Tải mã dự phòng thành file .txt ngay trong trình duyệt (không gửi đi đâu; Blob chỉ tồn tại ở máy người dùng). */
function downloadCodes(codes: string[]) {
  const url = URL.createObjectURL(new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'commentflow-backup-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
}

/** Danh sách mã dự phòng: hiện một lần, có nút sao chép (không lưu ở đâu khác ngoài màn hình này). */
function BackupCodes({ codes, onSaved }: { codes: string[]; onSaved?: () => void }) {
  const t = useTranslations('auth.security.twoFactor');
  const [copied, setCopied] = useState(false);
  // Mã chỉ hiện một lần: cảnh báo trước khi đóng/tải lại tab trong lúc còn hiện (gỡ khi bấm "Đã lưu" hoặc rời màn này).
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false); // trình duyệt chặn clipboard: người dùng vẫn tự chép từ danh sách
    }
  };
  return (
    <section aria-labelledby="backup-title" className="space-y-space-md">
      <TwBanner tone="warning">
        <h3 id="backup-title" className="font-title-sm text-title-sm">
          {t('backupTitle')}
        </h3>
        <p>{t('backupBody')}</p>
      </TwBanner>
      <ul className="bg-surface-container-low p-space-lg rounded-xl grid grid-cols-2 gap-3 text-center font-mono font-bold text-on-surface">
        {codes.map((code) => (
          <li key={code} className="bg-surface-container-lowest p-2 rounded shadow-sm">
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-space-sm flex-wrap">
        <button type="button" className={twBtn({ tone: 'soft', size: 'lg' })} onClick={copy}>
          <Icon name="content_copy" size={16} />
          {copied ? t('copied') : t('copy')}
        </button>
        <button
          type="button"
          className={twBtn({ tone: 'soft', size: 'lg' })}
          onClick={() => downloadCodes(codes)}
        >
          <Icon name="download" size={16} />
          {t('downloadTxt')}
        </button>
        {onSaved ? (
          <button
            type="button"
            className={twBtn({ tone: 'primary', size: 'lg' })}
            onClick={onSaved}
          >
            {t('saved')}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Chưa bật: mật khẩu → quét QR + nhập mã đầu tiên → lưu mã dự phòng. */
function EnableFlow({
  onEnrolling,
  onFinished,
}: {
  onEnrolling: () => void;
  onFinished: () => void;
}) {
  const t = useTranslations('auth.security.twoFactor');
  const router = useRouter();
  const [begin, beginAction] = useActionState(beginTwoFactorAction, SECURITY_IDLE);
  const [confirm, confirmAction] = useActionState(confirmTwoFactorAction, SECURITY_IDLE);
  const beginError = useError(begin);
  const confirmError = useError(confirm);
  const enrolling = begin.status === 'enroll';
  // Báo thẻ cha giữ luồng này khi máy chủ dựng lại trang với 2FA đã bật (để mã dự phòng không biến mất).
  useEffect(() => {
    if (enrolling) onEnrolling();
  }, [enrolling, onEnrolling]);
  const step = enrollStep({ begun: enrolling, confirmed: confirm.status === 'done' });

  if (begin.status === 'enroll' && confirm.status === 'done') {
    return (
      <div className="space-y-space-md">
        <EnrollStepper step={step} />
        <BackupCodes
          codes={begin.backupCodes}
          onSaved={() => {
            onFinished();
            router.refresh();
          }}
        />
      </div>
    );
  }
  if (begin.status === 'enroll') {
    return (
      <div className="space-y-space-md">
        <EnrollStepper step={step} />
        <form
          action={confirmAction}
          noValidate
          className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg"
        >
          <div className="lg:col-span-5 bg-surface-container-low p-space-lg rounded-xl space-y-space-md">
            <div>
              <h3 className="font-title-sm text-title-sm text-on-surface flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-primary-container" aria-hidden="true" />
                {t('scanTitle')}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                {t('scanBody')}
              </p>
            </div>
            <div className="flex justify-center p-space-md bg-surface-container-lowest rounded-xl shadow-sm">
              {/* Ảnh QR do server tạo (data URL); khóa bí mật không đi qua dịch vụ nào bên ngoài. */}
              {/* biome-ignore lint/performance/noImgElement: data URL nhúng sẵn, không cần tối ưu ảnh của Next */}
              <img
                src={begin.qrDataUrl}
                width={176}
                height={176}
                alt={t('qrAlt')}
                className="w-44 h-44"
              />
            </div>
            <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-1.5">
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t('manualKey')}
              </p>
              <code className="block bg-surface-container-low px-2.5 py-1.5 rounded-lg font-code-sm text-code-sm font-bold text-primary-container tracking-wider break-all">
                {begin.manualKey}
              </code>
            </div>
          </div>
          <div className="lg:col-span-7 bg-surface-container-lowest p-space-md rounded-xl space-y-space-md self-start">
            {confirmError ? <TwBanner tone="danger">{confirmError}</TwBanner> : null}
            <TwCodeField name="code" label={t('confirmLabel')} />
            <div className="flex justify-end">
              <TwSubmit>{t('confirm')}</TwSubmit>
            </div>
          </div>
        </form>
      </div>
    );
  }
  return (
    <div className="space-y-space-md">
      <EnrollStepper step={step} />
      <form action={beginAction} noValidate className="space-y-space-md">
        {beginError ? <TwBanner tone="danger">{beginError}</TwBanner> : null}
        <TwPasswordField
          name="password"
          label={t('passwordLabel')}
          hint={t('passwordHint')}
          autoComplete="current-password"
        />
        <div className="flex justify-end">
          <TwSubmit>{t('start')}</TwSubmit>
        </div>
      </form>
    </div>
  );
}

/** Tạo lại mã dự phòng (cần mật khẩu); mã mới hiện ngay trong hộp thoại. */
function RegenFlow() {
  const t = useTranslations('auth.security.twoFactor');
  const [regen, regenAction] = useActionState(regenerateBackupCodesAction, SECURITY_IDLE);
  const regenError = useError(regen);
  return (
    <div className="space-y-space-md">
      {regen.status === 'codes' ? <BackupCodes codes={regen.backupCodes} /> : null}
      <form action={regenAction} noValidate className="space-y-space-md">
        <p className="font-body-md text-body-md text-on-surface-variant">{t('regenBody')}</p>
        {regenError ? <TwBanner tone="danger">{regenError}</TwBanner> : null}
        <TwPasswordField
          name="password"
          label={t('passwordLabel')}
          autoComplete="current-password"
        />
        <div className="flex justify-end">
          <TwSubmit tone="soft">{t('regen')}</TwSubmit>
        </div>
      </form>
    </div>
  );
}

/** Tắt 2FA (cần mật khẩu). Chỉ dựng khi tài khoản không bắt buộc 2FA (Owner/Admin không được tắt). */
function DisableFlow() {
  const t = useTranslations('auth.security.twoFactor');
  const [disable, disableAction] = useActionState(disableTwoFactorAction, SECURITY_IDLE);
  const disableError = useError(disable);
  return (
    <form action={disableAction} noValidate className="space-y-space-md">
      <TwBanner tone="warning" icon="gpp_maybe">
        {t('disableBody')}
      </TwBanner>
      {disableError ? <TwBanner tone="danger">{disableError}</TwBanner> : null}
      <TwPasswordField name="password" label={t('passwordLabel')} autoComplete="current-password" />
      <div className="flex justify-end">
        <TwSubmit tone="danger">{t('disable')}</TwSubmit>
      </div>
    </form>
  );
}

function InfoTile({
  title,
  icon,
  tone,
  value,
  hint,
  note,
  noteIcon,
  noteOk = false,
}: {
  title: string;
  icon: ReactNode;
  /** Màu biểu tượng góc phải thẻ (class chữ Tailwind). */
  tone: string;
  value: string;
  hint: string;
  note?: string;
  noteIcon: ReactNode;
  noteOk?: boolean;
}) {
  return (
    <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between text-on-surface-variant mb-2">
          <span className="font-label-sm text-label-sm uppercase tracking-wide">{title}</span>
          <span className={tone}>{icon}</span>
        </div>
        <div className="font-title-md text-title-md text-on-surface">{value}</div>
        <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">{hint}</div>
      </div>
      {note ? (
        <div
          className={cn(
            'pt-3 flex items-center gap-1 font-label-sm text-label-sm',
            noteOk ? 'text-[#237A36]' : 'text-on-surface-variant',
          )}
        >
          {noteIcon}
          <span>{note}</span>
        </div>
      ) : null}
    </div>
  );
}

export function TwoFactorCard({ enabled, required }: { enabled: boolean; required: boolean }) {
  const t = useTranslations('auth.security.twoFactor');
  const [enrolling, setEnrolling] = useState(false);
  const startEnrolling = useCallback(() => setEnrolling(true), []);
  // Banner xanh chỉ hiện NGAY SAU khi bật (state của phiên trang này — tải lại trang là mất).
  const [justEnabled, setJustEnabled] = useState(false);
  const finishEnrolling = useCallback(() => {
    setEnrolling(false);
    setJustEnabled(true);
  }, []);
  const enableFlow = showEnableFlow({ enabled, enrolling });
  return (
    <>
      {justEnabled && enabled ? (
        <div
          role="status"
          className="bg-surface-container-lowest shadow-md rounded-xl p-space-lg flex items-start justify-between gap-space-md"
        >
          <div className="flex items-start gap-space-md">
            <div className="w-10 h-10 rounded-full bg-[#EBF7ED] text-[#237A36] flex items-center justify-center shrink-0">
              <Icon name="verified_user" size={24} />
            </div>
            <div className="space-y-1">
              <p className="font-title-md text-title-md text-[#237A36]">{t('justEnabledTitle')}</p>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">
                {t('justEnabledBody')}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('dismiss')}
            onClick={() => setJustEnabled(false)}
            className="w-8 h-8 rounded-lg text-on-surface-variant hover:bg-surface-container flex items-center justify-center transition-colors shrink-0"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ) : null}
      <TwCard labelledBy={TITLE_ID}>
        <TwCardHead
          id={TITLE_ID}
          hero
          icon={<Icon name="lock_person" size={24} />}
          title={
            <>
              {t('title')}
              <TwChip tone={enabled ? 'ok' : 'muted'} dot className="px-3 py-1 font-semibold">
                {enabled ? t('statusOn') : t('statusOff')}
              </TwChip>
            </>
          }
          description={enabled ? t('onBody') : t('offBody')}
          end={
            <>
              {enableFlow ? (
                // Cả khi 2FA vừa bật nhưng còn đang hiện mã dự phòng: nút phải mở lại đúng hộp thoại này.
                <TwDialogTrigger dialogId={SETUP_ID} className={twBtn({ tone: 'primary' })}>
                  {t('start')}
                </TwDialogTrigger>
              ) : (
                <TwSoonButton tone="soft" soon={t('soon')}>
                  <Icon name="phonelink_setup" size={16} />
                  {t('switchDevice')}
                </TwSoonButton>
              )}
              {!enableFlow && !required ? (
                <TwDialogTrigger dialogId={DISABLE_ID} className={twBtn({ tone: 'danger-ghost' })}>
                  <Icon name="power_settings_new" size={16} />
                  {t('disableTitle')}
                </TwDialogTrigger>
              ) : null}
            </>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <InfoTile
            title={t('tiles.method')}
            icon={<Icon name="smartphone" size={16} />}
            tone={TONE_PRIMARY}
            value={t('tiles.methodValue')}
            hint={t('tiles.methodHint')}
            note={enabled ? t('tiles.rotation') : undefined}
            noteIcon={<Icon name="security_update_good" size={14} />}
            noteOk
          />
          <InfoTile
            title={t('tiles.deviceTitle')}
            icon={<Icon name="devices" size={16} />}
            tone={TONE_SECONDARY}
            value={t('tiles.deviceValue')}
            hint={t('tiles.deviceHint')}
            note={t('soon')}
            noteIcon={<Icon name="schedule" size={14} />}
          />
          <InfoTile
            title={t('tiles.policyTitle')}
            icon={<Icon name="shield" size={16} />}
            tone={TONE_PRIMARY}
            value={required ? t('tiles.policyRequired') : t('tiles.policyOptional')}
            hint={t('tiles.policyHint')}
            note={enabled ? t('tiles.policyMet') : undefined}
            noteIcon={<Icon name="check" size={14} />}
            noteOk
          />
        </div>
        {enabled && !enableFlow ? (
          <div className="bg-surface-container rounded-xl p-space-lg space-y-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <div className="flex items-start gap-space-sm">
                <span className="text-tertiary shrink-0 mt-0.5">
                  <Icon name="key_visualizer" size={24} />
                </span>
                <div>
                  <h3 className="font-title-md text-title-md text-on-surface">
                    {t('backupBlockTitle')}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 max-w-2xl">
                    {t('backupBlockBody')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <TwSoonButton tone="primary" size="sm" soon={t('soon')}>
                  <Icon name="visibility" size={16} />
                  {t('viewCodes')}
                </TwSoonButton>
                <TwSoonButton tone="plain" size="sm" soon={t('soon')}>
                  <Icon name="download" size={16} />
                  {t('downloadTxt')}
                </TwSoonButton>
                <TwDialogTrigger
                  dialogId={REGEN_ID}
                  className={twBtn({ tone: 'plain', size: 'sm' })}
                >
                  <Icon name="refresh" size={16} />
                  {t('regenTitle')}
                </TwDialogTrigger>
              </div>
            </div>
            <ul
              aria-label={t('maskedLabel')}
              className="bg-surface-container-lowest rounded-lg p-space-md grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center"
            >
              {MASKED_SLOTS.map((slot) => (
                <li
                  key={slot}
                  className="py-1 px-2 rounded bg-surface-container-low text-on-surface-variant font-label-md text-label-md tracking-wider"
                >
                  {MASKED_CODE}
                </li>
              ))}
            </ul>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{t('maskedNote')}</p>
          </div>
        ) : null}
        {enableFlow ? (
          <TwDialog
            dialogId={SETUP_ID}
            title={t('setupTitle')}
            description={t('setupBody')}
            icon={<Icon name="lock_person" size={20} />}
            size="xl"
            defaultOpen={required && !enabled}
          >
            <EnableFlow onEnrolling={startEnrolling} onFinished={finishEnrolling} />
          </TwDialog>
        ) : (
          <>
            <TwDialog
              dialogId={REGEN_ID}
              title={t('regenTitle')}
              icon={<Icon name="refresh" size={20} />}
              size="lg"
            >
              <RegenFlow />
            </TwDialog>
            {required ? null : (
              <TwDialog
                dialogId={DISABLE_ID}
                title={t('disableTitle')}
                icon={<Icon name="gpp_maybe" size={24} />}
                tone="danger"
              >
                <DisableFlow />
              </TwDialog>
            )}
          </>
        )}
      </TwCard>
    </>
  );
}
