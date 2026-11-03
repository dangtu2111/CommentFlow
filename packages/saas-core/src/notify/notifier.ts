import type { Locale } from '@flow/shared';
import { type EmailInput, type EmailKind, renderEmail } from './templates';
import type { MailTransport } from './transport';

export type Recipient = { email: string; name: string; locale: Locale };

/** Thông tin lỗi ĐÃ LỌC để ghi log: không có địa chỉ nhận, nội dung thư hay URL (chứa token). */
export type NotifyFailure = { kind: EmailKind; reason: string };

export type NotifierOptions = {
  transport: MailTransport;
  /** Gọi khi gửi không chờ (`*InBackground`) thất bại; không bao giờ ném lỗi ra ngoài. */
  onFailure?: (failure: NotifyFailure) => void;
};

/** Lớp gửi thông báo của saas-core: dựng thư theo ngôn ngữ người nhận rồi giao cho transport. */
export function createNotifier(options: NotifierOptions) {
  async function deliver(to: Recipient, input: EmailInput): Promise<void> {
    await options.transport.send(renderEmail(input, to.locale, { name: to.name, email: to.email }));
  }

  /**
   * Gửi KHÔNG chờ kết quả: thời gian phản hồi của request không phụ thuộc việc địa chỉ có gửi được hay
   * không (chống dò email qua thời gian — docs/08 §6, 13 §2).
   */
  function inBackground(to: Recipient, input: EmailInput): void {
    deliver(to, input).catch((error: unknown) => {
      const code = (error as { cause?: { code?: unknown } })?.cause?.code;
      options.onFailure?.({
        kind: input.kind,
        reason: typeof code === 'string' ? code : 'SEND_FAILED',
      });
    });
  }

  return {
    sendNow: deliver,
    sendInBackground: inBackground,
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
