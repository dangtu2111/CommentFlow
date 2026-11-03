/** Một thư đã dựng xong, sẵn sàng gửi. */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Cổng gửi thư. Hiện chỉ có SMTP (dev: Mailpit); nhà cung cấp production chưa chọn — thêm transport mới
 * (API của nhà cung cấp) mà không đổi `notifier` hay các luồng auth.
 */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** Transport lưu thư trong bộ nhớ — dùng cho test (không gửi đi đâu). */
export function createMemoryTransport(): MailTransport & { readonly sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
