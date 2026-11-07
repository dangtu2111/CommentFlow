'use client';

import { useTranslations } from 'next-intl';
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  startPhoneVerifyAction,
  verifyPhoneAction,
} from '../../app/app/(guarded)/settings/profile-actions';
import { cn } from '../../lib/cn';
import { Icon } from '../ui/icon';
import { PHONE_DIALOG_ID } from './profile-dialog';
import { TwDialog } from './tw/dialog';
import { twBtn } from './tw/ui';

type Step = 'phone' | 'otp' | 'done';
type ErrorKey =
  | 'invalid_phone'
  | 'invalid_code'
  | 'rate_limited'
  | 'cooldown'
  | 'send_failed'
  | 'disabled'
  | 'generic';
type Problem = { key: ErrorKey; seconds?: number };

const OTP_LENGTH = 6;
const STEP_KEYS = ['one', 'two', 'three'] as const;
const FIELD_CLASS =
  'w-full px-3 py-2.5 text-body-md text-on-surface bg-surface-container-lowest rounded-lg border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary-container focus:border-primary-container placeholder:text-outline transition aria-[invalid=true]:border-error';

function Stepper({ step }: { step: Step }) {
  const t = useTranslations('settings.phone.steps');
  const current = step === 'phone' ? 0 : step === 'otp' ? 1 : 2;
  return (
    <ol aria-label={t('label')} className="grid grid-cols-3 gap-2">
      {STEP_KEYS.map((key, index) => {
        const done = index < current || step === 'done';
        const active = index === current && step !== 'done';
        return (
          <li
            key={key}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg font-label-sm text-label-sm',
              active
                ? 'bg-surface-container-low text-primary font-semibold'
                : 'text-on-surface-variant',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold',
                done || active
                  ? 'bg-primary-container text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant',
              )}
            >
              {done ? <Icon name="check" size={14} /> : index + 1}
            </span>
            <span className="leading-tight">{t(key)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Hộp thoại xác minh SĐT 3 bước (Stitch `cai-dat-xac-minh-so-dien-thoai-phone-verification-modal-flow`): nhập SĐT → OTP 6 ô
 * + đếm ngược gửi lại → thành công. Mã gửi bằng SMS MOCK (không có tin thật); tắt cờ → thông báo, không gọi máy chủ.
 * Chỉ dựng các thành phần có thật: bỏ "Zalo OTP", "Miễn phí SMS", "Đã bảo vệ 100%", "Lỗi OTP-401"… của bản vẽ.
 */
export function PhoneDialog({ enabled }: { enabled: boolean }) {
  const t = useTranslations('settings.phone');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  // Đóng hộp thoại (nút X, Esc, Hoàn tất) → về bước 1 để lần mở sau không còn mã/số cũ.
  useEffect(() => {
    const node = document.getElementById(PHONE_DIALOG_ID);
    const reset = () => {
      setStep('phone');
      setPhone('');
      setMasked('');
      setDigits(Array(OTP_LENGTH).fill(''));
      setProblem(null);
      setResendAt(0);
    };
    node?.addEventListener('close', reset);
    return () => node?.removeEventListener('close', reset);
  }, []);

  useEffect(() => {
    if (step !== 'otp') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const code = digits.join('');

  const goOtp = (maskedPhone: string, wait: number) => {
    setMasked(maskedPhone);
    setStep('otp');
    setDigits(Array(OTP_LENGTH).fill(''));
    setNow(Date.now());
    setResendAt(Date.now() + wait * 1000);
    setProblem(null);
    setTimeout(() => boxes.current[0]?.focus(), 0);
  };

  const send = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await startPhoneVerifyAction(phone);
      if (result.status === 'sent') return goOtp(result.maskedPhone, result.resendAfterSeconds);
      if (result.status === 'cooldown') {
        // Đã có mã còn hạn cho số này (ví dụ mở lại hộp thoại): sang bước nhập mã, đếm ngược phần còn lại.
        setStep('otp');
        setNow(Date.now());
        setResendAt(Date.now() + result.retryAfterSeconds * 1000);
        setMasked('');
        return;
      }
      if (result.status === 'rate_limited') {
        return setProblem({ key: 'rate_limited', seconds: result.retryAfterSeconds });
      }
      setProblem({ key: result.status });
    });
  };

  const verify = () => {
    if (code.length !== OTP_LENGTH) return setProblem({ key: 'invalid_code' });
    setProblem(null);
    startTransition(async () => {
      const result = await verifyPhoneAction(code);
      if (result.status === 'verified') {
        setMasked(result.maskedPhone);
        return setStep('done');
      }
      setDigits(Array(OTP_LENGTH).fill(''));
      boxes.current[0]?.focus();
      if (result.status === 'rate_limited') {
        return setProblem({ key: 'rate_limited', seconds: result.retryAfterSeconds });
      }
      setProblem({ key: result.status === 'disabled' ? 'disabled' : 'invalid_code' });
    });
  };

  const setDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((d, i) => (i === index ? digit : d)));
    if (digit && index < OTP_LENGTH - 1) boxes.current[index + 1]?.focus();
  };
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) boxes.current[index - 1]?.focus();
    if (event.key === 'Enter') verify();
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? ''));
    boxes.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const closeDialog = () => {
    const node = document.getElementById(PHONE_DIALOG_ID);
    if (node instanceof HTMLDialogElement) node.close();
  };

  return (
    <TwDialog
      dialogId={PHONE_DIALOG_ID}
      title={t('title')}
      description={t('body')}
      icon={<Icon name="phonelink_lock" size={20} />}
      size="lg"
    >
      <div className="space-y-space-md">
        <Stepper step={step} />
        {enabled ? null : (
          <p
            role="status"
            className="p-3 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant"
          >
            {t('off')}
          </p>
        )}

        {step === 'phone' ? (
          <div className="space-y-space-md" data-step="phone">
            <div className="space-y-1.5">
              <label htmlFor="phone-input" className="font-title-sm text-title-sm text-on-surface">
                {t('numberLabel')} <span className="text-error">*</span>
              </label>
              <div className="flex items-stretch gap-2">
                <span
                  aria-hidden="true"
                  className="px-3 flex items-center gap-1.5 rounded-lg bg-surface-container-low text-on-surface font-title-sm text-title-sm"
                >
                  <Icon name="dialpad" size={16} />
                  +84
                </span>
                <input
                  id="phone-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  placeholder={t('numberPlaceholder')}
                  onChange={(event) => setPhone(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && enabled && !pending) send();
                  }}
                  aria-invalid={problem?.key === 'invalid_phone' ? true : undefined}
                  className={FIELD_CLASS}
                />
              </div>
              <p className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                <Icon name="info" size={14} />
                {t('numberHint')}
              </p>
            </div>
            <Problem problem={problem} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={send}
                disabled={!enabled || pending || phone.trim() === ''}
                aria-busy={pending}
                className={twBtn({ tone: 'primary' })}
              >
                {t('send')}
                <Icon name="forward_to_inbox" size={16} />
              </button>
            </div>
          </div>
        ) : null}

        {step === 'otp' ? (
          <div className="space-y-space-md" data-step="otp">
            <div className="flex items-start justify-between gap-2">
              <p className="font-body-md text-body-md text-on-surface">
                {t('sentTo')} {masked ? <strong data-testid="phone-masked">{masked}</strong> : null}
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setProblem(null);
                }}
                className={twBtn({ tone: 'plain', size: 'sm' })}
              >
                <Icon name="edit" size={14} />
                {t('changeNumber')}
              </button>
            </div>
            <fieldset className="flex justify-center gap-2 border-0 p-0 m-0 min-w-0">
              <legend className="sr-only">{t('otpLabel')}</legend>
              {digits.map((digit, index) => (
                <input
                  // biome-ignore lint/suspicious/noArrayIndexKey: sáu ô cố định theo vị trí
                  key={index}
                  ref={(node) => {
                    boxes.current[index] = node;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  aria-label={t('otpDigit', { n: index + 1 })}
                  aria-invalid={problem?.key === 'invalid_code' ? true : undefined}
                  onChange={(event) => setDigit(index, event.target.value)}
                  onKeyDown={(event) => onKeyDown(index, event)}
                  onPaste={onPaste}
                  className="w-11 h-12 text-center font-headline-sm text-headline-sm text-on-surface bg-surface-container-lowest rounded-lg border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary-container aria-[invalid=true]:border-error"
                />
              ))}
            </fieldset>
            <p className="text-center font-label-sm text-label-sm text-on-surface-variant">
              {t('expiresHint')}
            </p>
            <Problem problem={problem} />
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                <Icon name="schedule" size={14} />
                {secondsLeft > 0 ? t('resendIn', { seconds: secondsLeft }) : null}
              </span>
              <button
                type="button"
                onClick={send}
                disabled={secondsLeft > 0 || pending || phone.trim() === ''}
                className={twBtn({ tone: 'plain', size: 'sm' })}
              >
                <Icon name="refresh" size={14} />
                {t('resend')}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setProblem(null);
                }}
                className={twBtn({ tone: 'plain' })}
              >
                <Icon name="arrow_back" size={16} />
                {t('back')}
              </button>
              <button
                type="button"
                onClick={verify}
                disabled={pending || code.length !== OTP_LENGTH}
                aria-busy={pending}
                className={twBtn({ tone: 'primary' })}
              >
                <Icon name="verified_user" size={16} />
                {t('verify')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="space-y-space-md text-center" data-step="done">
            <span
              aria-hidden="true"
              className="mx-auto w-14 h-14 rounded-full bg-[#EBF7ED] text-[#237A36] flex items-center justify-center"
            >
              <Icon name="check" size={32} />
            </span>
            <h3 className="font-title-md text-title-md text-on-surface">{t('successTitle')}</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('successBody', { phone: masked })}
            </p>
            <div className="flex justify-center">
              <button type="button" onClick={closeDialog} className={twBtn({ tone: 'primary' })}>
                {t('done')}
                <Icon name="done_all" size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </TwDialog>
  );
}

function Problem({ problem }: { problem: Problem | null }) {
  const t = useTranslations('settings.phone.errors');
  if (!problem) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 p-2.5 rounded-lg bg-error-container text-on-error-container font-label-sm text-label-sm font-medium"
    >
      <Icon name="warning" size={16} />
      {t(problem.key, { seconds: problem.seconds ?? 0 })}
    </p>
  );
}
