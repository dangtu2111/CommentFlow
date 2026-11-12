import { getTranslations } from 'next-intl/server';
import { noticeVariant, type PublishNoticeCode } from '../../lib/publish-notice';
import { Icon, type IconName } from '../ui/icon';

const STYLE = {
  success: { box: 'bg-primary-fixed/60 text-on-surface', icon: 'check_circle' as IconName },
  info: { box: 'bg-surface-container-low text-on-surface', icon: 'info' as IconName },
  warning: { box: 'bg-tertiary-fixed/50 text-on-surface', icon: 'warning' as IconName },
  danger: { box: 'bg-error-container text-on-error-container', icon: 'warning' as IconName },
};

/** Thông báo sau thao tác bài đăng (Biên tập và Lịch dùng chung). Chữ lấy từ `composer.notice.<mã>`; lỗi dùng `role="alert"`. Chỉ dùng bên trong `.tw`. */
export async function NoticeBanner({ code }: { code: PublishNoticeCode }) {
  const t = await getTranslations('composer');
  const variant = noticeVariant(code);
  const style = STYLE[variant];
  return (
    <p
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-space-xs rounded-lg p-space-md font-body-sm text-body-sm ${style.box}`}
    >
      <span className="mt-0.5">
        <Icon name={style.icon} size={16} />
      </span>
      <span>{t(`notice.${code}`)}</span>
    </p>
  );
}
