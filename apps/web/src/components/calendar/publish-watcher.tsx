'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { checkPublishOutcomeAction } from '../../app/app/(guarded)/composer/actions';
import type { PublishOutcome } from '../../lib/publish-outcome';
import { Icon } from '../ui/icon';

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 phút: đủ cho một lượt quét 20 giây của worker cộng độ trễ.

const KNOWN_ERRORS = new Set([
  'missing_permission',
  'permission',
  'token_expired',
  'invalid_post',
  'rate_limited',
  'unknown_result',
  'lease_expired',
]);

/**
 * Sau "Đăng ngay": theo dõi bài tới khi worker có kết quả rồi báo THÀNH CÔNG hoặc THẤT BẠI ngay trên Lịch (không phải tự tải lại). Hỏi trạng thái bằng Server Action chỉ đọc
 * (Owner, DB kiểm workspace). Hết thời gian chờ mà chưa có kết quả → nói thật là chưa có, không đoán. Khi có kết quả thì làm mới Lịch.
 */
export function PublishWatcher({ postId }: { postId: string }) {
  const t = useTranslations('calendar');
  const router = useRouter();
  const [outcome, setOutcome] = useState<PublishOutcome>({ state: 'pending' });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let stopped = false;
    let polls = 0;
    const tick = async () => {
      if (stopped) return;
      polls += 1;
      try {
        const next = await checkPublishOutcomeAction(postId);
        if (stopped) return;
        setOutcome(next);
        if (next.state !== 'pending') {
          router.refresh();
          return;
        }
      } catch {
        // Lỗi mạng tạm thời: thử lại ở lần sau, không báo sai.
      }
      if (polls >= MAX_POLLS) {
        setTimedOut(true);
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [postId, router]);

  const reason = (code: string | null) =>
    t(`publishError.${code && KNOWN_ERRORS.has(code) ? code : 'unknown_result'}`);

  let tone = 'bg-surface-container-low text-on-surface';
  let icon = 'progress_activity';
  let text = t('watch.pending');
  let role: 'status' | 'alert' = 'status';
  if (outcome.state === 'published') {
    tone = 'bg-primary-fixed/60 text-on-surface';
    icon = 'check_circle';
    text = t('watch.published');
  } else if (outcome.state === 'failed') {
    tone = 'bg-error-container text-on-error-container';
    icon = 'error';
    role = 'alert';
    text = t('watch.failed', { reason: reason(outcome.errorCode) });
  } else if (outcome.state === 'unknown') {
    tone = 'bg-tertiary-fixed/50 text-on-surface';
    icon = 'warning';
    role = 'alert';
    text = t('watch.unknown', { reason: reason(outcome.errorCode) });
  } else if (timedOut) {
    tone = 'bg-tertiary-fixed/50 text-on-surface';
    icon = 'warning';
    text = t('watch.timeout');
  }
  return (
    <p
      role={role}
      aria-live="polite"
      className={`flex items-start gap-space-xs rounded-lg p-space-md font-body-sm text-body-sm ${tone}`}
    >
      <span className={`mt-0.5 ${icon === 'progress_activity' ? 'animate-spin' : ''}`}>
        <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={16} />
      </span>
      <span>{text}</span>
    </p>
  );
}
