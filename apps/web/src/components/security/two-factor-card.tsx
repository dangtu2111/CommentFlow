'use client';

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
import { showEnableFlow } from '../../lib/two-factor-view';
import { Banner } from '../ui/banner';
import { CodeField, PasswordField } from '../ui/fields';
import { SubmitButton } from '../ui/submit-button';

function useError(state: SecurityState): string | undefined {
  const t = useTranslations('auth.errors');
  return state.status === 'error'
    ? t(state.message, { minutes: state.retryMinutes ?? 15 })
    : undefined;
}

/** Danh sách mã dự phòng: hiện một lần, có nút sao chép (không lưu ở đâu khác ngoài màn hình này). */
function BackupCodes({ codes, onSaved }: { codes: string[]; onSaved?: () => void }) {
  const t = useTranslations('auth.security.twoFactor');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false); // trình duyệt chặn clipboard: người dùng vẫn tự chép từ danh sách
    }
  };
  return (
    <section className="stack" aria-labelledby="backup-title">
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

  if (begin.status === 'enroll' && confirm.status === 'done') {
    return (
      <BackupCodes
        codes={begin.backupCodes}
        onSaved={() => {
          onFinished();
          router.refresh();
        }}
      />
    );
  }
  if (begin.status === 'enroll') {
    return (
      <form action={confirmAction} className="form" noValidate>
        <h3 className="section-subtitle">{t('scanTitle')}</h3>
        <p className="muted">{t('scanBody')}</p>
        {/* Ảnh QR do server tạo (data URL); khóa bí mật không đi qua dịch vụ nào bên ngoài. */}
        {/* biome-ignore lint/performance/noImgElement: data URL nhúng sẵn, không cần tối ưu ảnh của Next */}
        <img className="qr" src={begin.qrDataUrl} width={224} height={224} alt={t('qrAlt')} />
        <p className="muted">
          {t('manualKey')} <code className="manual-key">{begin.manualKey}</code>
        </p>
        {confirmError ? <Banner variant="danger">{confirmError}</Banner> : null}
        <CodeField name="code" label={t('confirmLabel')} />
        <SubmitButton>{t('confirm')}</SubmitButton>
      </form>
    );
  }
  return (
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
  );
}

/** Đã bật: tạo lại mã dự phòng và tắt 2FA (đều cần mật khẩu). Owner/Admin không được tắt. */
function ManageFlow({ required }: { required: boolean }) {
  const t = useTranslations('auth.security.twoFactor');
  const [regen, regenAction] = useActionState(regenerateBackupCodesAction, SECURITY_IDLE);
  const [disable, disableAction] = useActionState(disableTwoFactorAction, SECURITY_IDLE);
  const regenError = useError(regen);
  const disableError = useError(disable);
  return (
    <div className="stack">
      {regen.status === 'codes' ? <BackupCodes codes={regen.backupCodes} /> : null}
      <form action={regenAction} className="form" noValidate>
        <h3 className="section-subtitle">{t('regenTitle')}</h3>
        <p className="muted">{t('regenBody')}</p>
        {regenError ? <Banner variant="danger">{regenError}</Banner> : null}
        <PasswordField name="password" label={t('passwordLabel')} autoComplete="current-password" />
        <SubmitButton variant="secondary" block={false}>
          {t('regen')}
        </SubmitButton>
      </form>
      {required ? null : (
        <form action={disableAction} className="form" noValidate>
          <h3 className="section-subtitle">{t('disableTitle')}</h3>
          <p className="muted">{t('disableBody')}</p>
          {disableError ? <Banner variant="danger">{disableError}</Banner> : null}
          <PasswordField
            name="password"
            label={t('passwordLabel')}
            autoComplete="current-password"
          />
          <SubmitButton variant="secondary" block={false}>
            {t('disable')}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function TwoFactorCard({ enabled, required }: { enabled: boolean; required: boolean }) {
  const t = useTranslations('auth.security.twoFactor');
  const [enrolling, setEnrolling] = useState(false);
  const startEnrolling = useCallback(() => setEnrolling(true), []);
  const finishEnrolling = useCallback(() => setEnrolling(false), []);
  return (
    <section className="card stack" aria-labelledby="two-factor-title">
      <div className="row row-between">
        <h2 id="two-factor-title" className="section-title">
          {t('title')}
        </h2>
        <span className={`badge ${enabled ? 'badge-on' : 'badge-off'}`}>
          {enabled ? t('statusOn') : t('statusOff')}
        </span>
      </div>
      <p className="muted">{enabled ? t('onBody') : t('offBody')}</p>
      {showEnableFlow({ enabled, enrolling }) ? (
        <EnableFlow onEnrolling={startEnrolling} onFinished={finishEnrolling} />
      ) : (
        <ManageFlow required={required} />
      )}
    </section>
  );
}
