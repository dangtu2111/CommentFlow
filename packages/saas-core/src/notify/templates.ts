import { DEFAULT_BRAND, type Locale } from '@flow/shared';
import type { MailMessage } from './transport';

type StaticEmailKind = 'verify-email' | 'reset-password' | 'account-exists' | 'password-changed';
export type EmailKind = StaticEmailKind | 'workspace-invite' | 'owner-change';

export type WorkspaceRole = 'owner' | 'staff';
/** Thay đổi Owner cần báo cho mọi Owner (docs/13 §3.1): thêm / đổi vai trò / gỡ. */
export type OwnerChange = 'added' | 'role_changed' | 'removed' | 'suspended' | 'restored' | 'left';

export type EmailInput =
  | { kind: 'verify-email'; url: string }
  | { kind: 'reset-password'; url: string }
  | { kind: 'account-exists'; loginUrl: string; resetUrl: string }
  /** Báo vừa đổi mật khẩu trong Cài đặt; `url` = trang đặt lại mật khẩu (nếu không phải chính chủ). */
  | { kind: 'password-changed'; url: string }
  | {
      kind: 'workspace-invite';
      /** Liên kết nhận lời mời (chứa token — không bao giờ ghi log). */
      url: string;
      workspaceName: string;
      role: WorkspaceRole;
      inviterName: string;
      days: number;
    }
  | {
      kind: 'owner-change';
      /** Trang Thành viên của workspace. */
      url: string;
      workspaceName: string;
      change: OwnerChange;
      /** Tên người bị thay đổi và người thực hiện (tên hiển thị, không email). */
      targetName: string;
      actorName: string;
    };

type Copy = {
  subject: string;
  greeting: (name: string) => string;
  intro: string;
  action: string;
  footer: string;
};

// Màu thương hiệu (docs/08 §2.1: primary-600 / text / text-muted / border). Email không dùng được biến CSS.
const COLORS = { primary: '#0B7285', text: '#0F1C24', muted: '#4A5A66', border: '#DDE3E7' };

/** Thời hạn hiển thị trong thư — phải khớp cấu hình ở createAuth (xem auth.ts). */
export const VERIFY_EMAIL_HOURS = 24;
export const RESET_PASSWORD_HOURS = 1;

const buildCopy = (brand: string): Record<Locale, Record<StaticEmailKind, Copy>> => ({
  vi: {
    'verify-email': {
      subject: `Xác minh email của bạn — ${brand}`,
      greeting: (name) => `Chào ${name},`,
      intro: `Cảm ơn bạn đã đăng ký ${brand}. Bấm nút bên dưới để xác minh email. Liên kết hết hạn sau ${VERIFY_EMAIL_HOURS} giờ.`,
      action: 'Xác minh email',
      footer:
        'Nếu bạn không đăng ký, hãy bỏ qua thư này — không có gì thay đổi với địa chỉ của bạn.',
    },
    'reset-password': {
      subject: `Đặt lại mật khẩu — ${brand}`,
      greeting: (name) => `Chào ${name},`,
      intro: `Chúng tôi nhận được yêu cầu đặt lại mật khẩu. Bấm nút bên dưới để đặt mật khẩu mới. Liên kết dùng một lần và hết hạn sau ${RESET_PASSWORD_HOURS} giờ.`,
      action: 'Đặt lại mật khẩu',
      footer: 'Nếu bạn không yêu cầu, hãy bỏ qua thư này — mật khẩu của bạn vẫn như cũ.',
    },
    'account-exists': {
      subject: `Bạn đã có tài khoản — ${brand}`,
      greeting: (name) => `Chào ${name},`,
      intro: `Có người vừa đăng ký ${brand} bằng email này, nhưng email đã có tài khoản. Nếu là bạn, hãy đăng nhập; nếu quên mật khẩu, bạn có thể đặt lại.`,
      action: 'Đăng nhập',
      footer: 'Nếu không phải bạn, hãy bỏ qua thư này — không có tài khoản mới nào được tạo.',
    },
    'password-changed': {
      subject: `Mật khẩu của bạn vừa được đổi — ${brand}`,
      greeting: (name) => `Chào ${name},`,
      intro: `Mật khẩu tài khoản ${brand} của bạn vừa được đổi và mọi thiết bị đã bị đăng xuất. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.`,
      action: 'Đặt lại mật khẩu',
      footer: 'Nếu chính bạn đã đổi, không cần làm gì thêm.',
    },
  },
  en: {
    'verify-email': {
      subject: `Verify your email — ${brand}`,
      greeting: (name) => `Hi ${name},`,
      intro: `Thanks for signing up for ${brand}. Select the button below to verify your email. The link expires in ${VERIFY_EMAIL_HOURS} hours.`,
      action: 'Verify email',
      footer: "If you didn't sign up, ignore this email — nothing changes for your address.",
    },
    'reset-password': {
      subject: `Reset your password — ${brand}`,
      greeting: (name) => `Hi ${name},`,
      intro: `We received a request to reset your password. Select the button below to choose a new one. The link works once and expires in ${RESET_PASSWORD_HOURS} hour.`,
      action: 'Reset password',
      footer: "If you didn't ask for this, ignore this email — your password stays the same.",
    },
    'account-exists': {
      subject: `You already have an account — ${brand}`,
      greeting: (name) => `Hi ${name},`,
      intro: `Someone just tried to sign up for ${brand} with this email, but it already has an account. If that was you, sign in; if you forgot your password, you can reset it.`,
      action: 'Sign in',
      footer: "If that wasn't you, ignore this email — no new account was created.",
    },
    'password-changed': {
      subject: `Your password was changed — ${brand}`,
      greeting: (name) => `Hi ${name},`,
      intro: `The password of your ${brand} account was just changed and all devices were signed out. If this wasn't you, reset your password right away.`,
      action: 'Reset password',
      footer: "If you made this change yourself, there's nothing more to do.",
    },
  },
});

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Chỉ cho http(s): chặn `javascript:` và các scheme lạ lọt vào href. */
function assertHttpUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL trong thư phải là http(s).');
  }
  return parsed.toString();
}

/**
 * Ký tự không được xuất hiện trong lời chào: ký tự điều khiển (chống chèn dòng/header vào thư) và ký tự đảo chiều
 * chữ (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) dùng để giả nội dung. So theo mã ký tự thay vì regex để
 * file không chứa ký tự ẩn nào.
 */
function isUnsafeChar(code: number): boolean {
  return (
    code <= 0x1f ||
    code === 0x7f ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** Tên hiển thị chỉ để chào: thay ký tự nguy hiểm bằng dấu cách, gộp dấu cách thừa và cắt gọn. */
function displayName(name: string): string {
  const cleaned = [...name]
    .map((char) => (isUnsafeChar(char.codePointAt(0) ?? 0) ? ' ' : char))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
  return cleaned.slice(0, 80) || '—';
}

function primaryAction(input: EmailInput): string {
  return assertHttpUrl(input.kind === 'account-exists' ? input.loginUrl : input.url);
}

const ROLE_LABEL: Record<Locale, Record<WorkspaceRole, string>> = {
  vi: { owner: 'Owner (chủ sở hữu)', staff: 'Staff (nhân viên)' },
  en: { owner: 'Owner', staff: 'Staff' },
};

/** Nội dung thư có tham số (tên workspace, người thực hiện...). Mọi chuỗi động qua displayName() trước khi chèn. */
function dynamicCopy(
  input: Extract<EmailInput, { kind: 'workspace-invite' | 'owner-change' }>,
  locale: Locale,
  brand: string,
): Copy {
  const workspace = displayName(input.workspaceName);
  if (input.kind === 'workspace-invite') {
    const inviter = displayName(input.inviterName);
    const role = ROLE_LABEL[locale][input.role];
    return locale === 'vi'
      ? {
          subject: `${inviter} mời bạn vào workspace "${workspace}" — ${brand}`,
          greeting: (name) => `Chào ${name},`,
          intro: `${inviter} mời bạn tham gia workspace "${workspace}" trên ${brand} với vai trò ${role}. Liên kết dùng một lần và hết hạn sau ${input.days} ngày. Bạn cần đăng nhập (hoặc đăng ký) bằng đúng email nhận thư này.`,
          action: 'Xem lời mời',
          footer: 'Nếu bạn không mong đợi lời mời này, hãy bỏ qua thư — không có gì thay đổi.',
        }
      : {
          subject: `${inviter} invited you to "${workspace}" — ${brand}`,
          greeting: (name) => `Hi ${name},`,
          intro: `${inviter} invited you to join the workspace "${workspace}" on ${brand} as ${role}. The link works once and expires in ${input.days} days. Sign in (or sign up) with the exact email that received this message.`,
          action: 'View invitation',
          footer: "If you weren't expecting this invitation, ignore this email — nothing changes.",
        };
  }
  const actor = displayName(input.actorName);
  const target = displayName(input.targetName);
  const what = {
    vi: {
      added: `${actor} đã thêm ${target} làm Owner`,
      role_changed: `${actor} đã đổi vai trò Owner của ${target}`,
      removed: `${actor} đã gỡ Owner ${target}`,
      suspended: `${actor} đã tạm khóa Owner ${target}`,
      restored: `${actor} đã mở khóa Owner ${target}`,
      left: `${target} đã tự rời khỏi`,
    },
    en: {
      added: `${actor} added ${target} as an Owner`,
      role_changed: `${actor} changed the Owner role of ${target}`,
      removed: `${actor} removed the Owner ${target}`,
      suspended: `${actor} suspended the Owner ${target}`,
      restored: `${actor} restored the Owner ${target}`,
      left: `${target} left`,
    },
  }[locale][input.change];
  return locale === 'vi'
    ? {
        subject:
          input.change === 'left'
            ? `Có thành viên rời "${workspace}" — ${brand}`
            : `Thay đổi Owner ở "${workspace}" — ${brand}`,
        greeting: (name) => `Chào ${name},`,
        intro: `${what} ${input.change === 'left' ? '' : 'trong '}workspace "${workspace}". Bạn nhận thư này vì bạn là Owner của workspace.`,
        action: 'Xem thành viên',
        footer: 'Nếu bạn không nhận ra thay đổi này, hãy vào trang Thành viên để kiểm tra ngay.',
      }
    : {
        subject:
          input.change === 'left'
            ? `A member left "${workspace}" — ${brand}`
            : `Owner change in "${workspace}" — ${brand}`,
        greeting: (name) => `Hi ${name},`,
        intro: `${what} ${input.change === 'left' ? '' : 'in '}the workspace "${workspace}". You receive this because you are an Owner of the workspace.`,
        action: 'View members',
        footer: "If you don't recognise this change, open the Members page and review it now.",
      };
}

function copyFor(input: EmailInput, locale: Locale, brand: string): Copy {
  return input.kind === 'workspace-invite' || input.kind === 'owner-change'
    ? dynamicCopy(input, locale, brand)
    : buildCopy(brand)[locale][input.kind];
}

export type RenderOptions = {
  /** Tên thương hiệu (FR-125); mặc định là giá trị tạm `DEFAULT_BRAND.name`. */
  brandName?: string;
};

export function renderEmail(
  input: EmailInput,
  locale: Locale,
  recipient: { name: string; email: string },
  options: RenderOptions = {},
): MailMessage {
  // Chuẩn hóa như tên hiển thị để cấu hình không chèn được dòng/ký tự đảo chiều vào chủ đề thư.
  const brand = displayName(options.brandName ?? DEFAULT_BRAND.name);
  const copy = copyFor(input, locale, brand);
  const name = displayName(recipient.name);
  const url = primaryAction(input);
  const resetUrl = input.kind === 'account-exists' ? assertHttpUrl(input.resetUrl) : null;
  const resetLabel = locale === 'vi' ? 'Quên mật khẩu? Đặt lại' : 'Forgot your password? Reset it';

  const text = [
    copy.greeting(name),
    '',
    copy.intro,
    '',
    `${copy.action}: ${url}`,
    ...(resetUrl ? ['', `${resetLabel}: ${resetUrl}`] : []),
    '',
    copy.footer,
    '',
    `— ${brand}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:24px;background:#F6F8F9;font-family:'Be Vietnam Pro',Arial,sans-serif;color:${COLORS.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid ${COLORS.border};border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600">${escapeHtml(copy.greeting(name))}</p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6">${escapeHtml(copy.intro)}</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:${COLORS.primary};color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(copy.action)}</a></p>
      ${resetUrl ? `<p style="margin:0 0 24px;font-size:14px"><a href="${escapeHtml(resetUrl)}" style="color:${COLORS.primary}">${escapeHtml(resetLabel)}</a></p>` : ''}
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${COLORS.muted}">${escapeHtml(copy.footer)}</p>
      <p style="margin:0;font-size:12px;color:${COLORS.muted}">— ${escapeHtml(brand)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { to: recipient.email, subject: copy.subject, text, html };
}
