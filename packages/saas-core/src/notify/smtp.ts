import { AppError } from '@flow/shared';
import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailTransport } from './transport';

export type SmtpOptions = {
  host: string;
  port: number;
  /** Địa chỉ người gửi, ví dụ `CommentFlow AI <no-reply@example.com>`. */
  from: string;
  /** true = TLS ngay khi kết nối (cổng 465); false = STARTTLS nếu máy chủ hỗ trợ. */
  secure?: boolean;
  user?: string;
  pass?: string;
};

/** Bọc một `Transporter` của nodemailer thành `MailTransport` (tách ra để test bằng `streamTransport`). */
export function createNodemailerTransport(transporter: Transporter, from: string): MailTransport {
  return {
    async send(message: MailMessage) {
      try {
        await transporter.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (cause) {
        // Không đưa nội dung thư / địa chỉ nhận vào thông báo lỗi (có thể chứa PII hoặc token).
        throw new AppError('INTERNAL', 'Không gửi được email.', { cause });
      }
    },
  };
}

export function createSmtpTransport(options: SmtpOptions): MailTransport {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure ?? false,
    ...(options.user && options.pass ? { auth: { user: options.user, pass: options.pass } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return createNodemailerTransport(transporter, options.from);
}
