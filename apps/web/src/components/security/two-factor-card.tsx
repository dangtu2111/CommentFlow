'use client';

import {
  Check,
  Download,
  KeyRound,
  LockKeyhole,
  Power,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useCallback, useEffect, useState } from 'react';
import {
  beginTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
} from '../../app/app/security/actions';
import { SECURITY_IDLE, type SecurityState } from '../../lib/security-form';
import { enrollStep } from '../../lib/settings-visual';
import { showEnableFlow } from '../../lib/two-factor-view';
import { Banner } from '../ui/banner';
import { Dialog, DialogTrigger } from '../ui/dialog';
import { CodeField, PasswordField } from '../ui/fields';
import { SectionHead } from '../ui/section-head';
import { SubmitButton } from '../ui/submit-button';

const SETUP_ID = 'two-factor-setup-dialog';
const REGEN_ID = 'two-factor-regen-dialog';
const DISABLE_ID = 'two-factor-disable-dialog';

function useError(state: SecurityState): string | undefined {
  const t = useTranslations('auth.errors');
  return state.status === 'error'
    ? t(state.message, { minutes: state.retryMinutes ?? 15 })
    : undefined;
}

/** Thanh ba bước của trình hướng dẫn bật 2FA (bước đã qua có dấu tích, bước hiện tại nổi bật). */
export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations('auth.security.twoFactor.steps');
  return (
    <ol className="stepper" aria-label={t('label')}>
      {([1, 2, 3] as const).map((n) => (
        <li
          key={n}
          className={n < step ? 'is-done' : n === step ? 'is-current' : undefined}
          aria-current={n === step ? 'step' : undefined}
        >
          <span className="stepper-dot" aria-hidden="true">
            {n < step ? <Check size={14} /> : n}
          </span>
          <span className="stepper-text">
            <small>{t('step', { n })}</small>
            {t(`name.${n}`)}
          </span>
        </li>
      ))}
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
    <section className="stack backup-box" aria-labelledby="backup-title">
      <h3 id="backup-title" className="section-subtitle">
        {t('backupTitle')}
      </h3>
      <p className="muted">{t('backupBody')}</p>
      <ul className="code-grid">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {copied ? t('copied') : t('copy')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => downloadCodes(codes)}>
          <Download size={16} aria-hidden="true" />
          {t('downloadTxt')}
        </button>
        {onSaved ? (
          <button type="button" className="btn btn-primary" onClick={onSaved}>
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
      <div className="stack">
        <Stepper step={step} />
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
      <div className="stack">
        <Stepper step={step} />
        <form action={confirmAction} className="form" noValidate>
          <div className="setup-grid">
            <div className="setup-qr">
              <h3 className="section-subtitle">{t('scanTitle')}</h3>
              <p className="muted">{t('scanBody')}</p>
              {/* Ảnh QR do server tạo (data URL); khóa bí mật không đi qua dịch vụ nào bên ngoài. */}
              {/* biome-ignore lint/performance/noImgElement: data URL nhúng sẵn, không cần tối ưu ảnh của Next */}
              <img className="qr" src={begin.qrDataUrl} width={224} height={224} alt={t('qrAlt')} />
              <p className="muted">
                {t('manualKey')} <code className="manual-key">{begin.manualKey}</code>
              </p>
            </div>
            <div className="setup-code">
              {confirmError ? <Banner variant="danger">{confirmError}</Banner> : null}
              <CodeField name="code" label={t('confirmLabel')} />
              <SubmitButton>{t('confirm')}</SubmitButton>
            </div>
          </div>
        </form>
      </div>
    );
  }
  return (
    <div className="stack">
      <Stepper step={step} />
      <form action={beginAction} className="form" noValidate>
        {beginError ? <Banner variant="danger">{beginError}</Banner> : null}
        <PasswordField
          name="password"
          label={t('passwordLabel')}
          hint={t('passwordHint')}
          autoComplete="current-password"
        />
        <SubmitButton block={false}>{t('start')}</SubmitButton>
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
    <div className="stack">
      {regen.status === 'codes' ? <BackupCodes codes={regen.backupCodes} /> : null}
      <form action={regenAction} className="form" noValidate>
        <p className="muted">{t('regenBody')}</p>
        {regenError ? <Banner variant="danger">{regenError}</Banner> : null}
        <PasswordField name="password" label={t('passwordLabel')} autoComplete="current-password" />
        <SubmitButton variant="secondary" block={false}>
          {t('regen')}
        </SubmitButton>
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
    <form action={disableAction} className="form" noValidate>
      <Banner variant="warning">{t('disableBody')}</Banner>
      {disableError ? <Banner variant="danger">{disableError}</Banner> : null}
      <PasswordField name="password" label={t('passwordLabel')} autoComplete="current-password" />
      <SubmitButton variant="secondary" block={false}>
        {t('disable')}
      </SubmitButton>
    </form>
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
        <div className="banner banner-success two-factor-just-enabled" role="status">
          <ShieldCheck size={22} aria-hidden="true" />
          <div className="stack-tight">
            <p className="section-subtitle">{t('justEnabledTitle')}</p>
            <p>{t('justEnabledBody')}</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={t('dismiss')}
            onClick={() => setJustEnabled(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <section className="card stack" aria-labelledby="two-factor-title">
        <SectionHead
          id="two-factor-title"
          icon={<LockKeyhole size={22} />}
          title={t('title')}
          description={enabled ? t('onBody') : t('offBody')}
          end={
            <div className="row">
              {enableFlow ? (
                // Cả khi 2FA vừa bật nhưng còn đang hiện mã dự phòng: nút phải mở lại đúng hộp thoại này.
                <DialogTrigger dialogId={SETUP_ID} className="btn btn-primary">
                  {t('start')}
                </DialogTrigger>
              ) : null}
              {!enableFlow && !required ? (
                <DialogTrigger dialogId={DISABLE_ID} className="btn btn-danger-ghost">
                  <Power size={16} aria-hidden="true" />
                  {t('disableTitle')}
                </DialogTrigger>
              ) : null}
            </div>
          }
        />
        <p>
          <span className={`chip ${enabled ? 'chip-success' : 'chip-muted'}`}>
            {enabled ? t('statusOn') : t('statusOff')}
          </span>
        </p>
        <dl className="info-tiles">
          <div className="info-tile">
            <dt>
              {t('tiles.method')}
              <Smartphone size={16} aria-hidden="true" />
            </dt>
            <dd>{t('tiles.methodValue')}</dd>
            <dd className="muted">{t('tiles.methodHint')}</dd>
            {enabled ? <dd className="info-tile-note is-ok">{t('tiles.rotation')}</dd> : null}
          </div>
        </dl>
        {enabled && !enableFlow ? (
          <div className="backup-block">
            <span className="section-head-icon" aria-hidden="true">
              <KeyRound size={22} />
            </span>
            <div className="backup-block-text">
              <h3 className="section-subtitle">{t('backupBlockTitle')}</h3>
              <p className="muted">{t('backupBlockBody')}</p>
            </div>
            <DialogTrigger dialogId={REGEN_ID} className="btn btn-secondary">
              <RefreshCw size={16} aria-hidden="true" />
              {t('regenTitle')}
            </DialogTrigger>
          </div>
        ) : null}
        {enableFlow ? (
          <Dialog
            dialogId={SETUP_ID}
            title={t('setupTitle')}
            description={t('setupBody')}
            icon={<LockKeyhole size={22} />}
            defaultOpen={required && !enabled}
          >
            <EnableFlow onEnrolling={startEnrolling} onFinished={finishEnrolling} />
          </Dialog>
        ) : (
          <>
            <Dialog dialogId={REGEN_ID} title={t('regenTitle')} icon={<RefreshCw size={22} />}>
              <RegenFlow />
            </Dialog>
            {required ? null : (
              <Dialog dialogId={DISABLE_ID} title={t('disableTitle')} icon={<Power size={22} />}>
                <DisableFlow />
              </Dialog>
            )}
          </>
        )}
      </section>
    </>
  );
}
