/**
 * Đọc thư thử từ Mailpit qua REST (`/api/v1/search`, `/api/v1/message/{id}`). Địa chỉ Mailpit lấy từ biến môi
 * trường `MAILPIT_URL` (không in ra). Thư do web gửi có một liên kết hành động dạng `<nhãn>: <url>` trong phần text.
 */

type FetchLike = (input: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type MailpitOptions = {
  baseUrl: string;
  fetchImpl?: FetchLike;
  /** Tổng thời gian chờ thư (ms). */
  timeoutMs?: number;
  /** Khoảng nghỉ giữa hai lần hỏi (ms). */
  intervalMs?: number;
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Mọi URL http(s) trong một đoạn text, theo thứ tự xuất hiện (bỏ dấu câu cuối câu). */
export function extractUrls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;)]+$/, ''));
}

/** URL đầu tiên khớp mẫu (ví dụ `/verify-email` hay `/invite/`) hoặc `undefined`. */
export function findUrl(text: string, pattern: RegExp): string | undefined {
  return extractUrls(text).find((url) => pattern.test(url));
}

/** Token mời nằm ở phần cuối đường dẫn `/invite/<token>`. */
export function inviteTokenFromUrl(url: string): string | undefined {
  return new URL(url).pathname.match(/^\/invite\/([A-Za-z0-9_-]+)$/)?.[1];
}

type SearchResponse = { messages?: { ID: string }[] };
type MessageResponse = { Text?: string };

function asObject<T>(value: unknown): T {
  return (value ?? {}) as T;
}

export function createMailpit(options: MailpitOptions) {
  const base = options.baseUrl.replace(/\/+$/, '');
  const request: FetchLike = options.fetchImpl ?? ((input) => fetch(input));
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 500;

  async function getJson<T>(path: string): Promise<T> {
    const response = await request(`${base}${path}`);
    if (!response.ok) throw new Error(`Mailpit trả về HTTP ${response.status} cho ${path}`);
    return asObject<T>(await response.json());
  }

  /** Text của mọi thư gửi tới `to`, mới nhất trước. */
  async function textsTo(to: string): Promise<string[]> {
    const query = encodeURIComponent(`to:${to}`);
    const found = await getJson<SearchResponse>(`/api/v1/search?query=${query}&limit=50`);
    const texts: string[] = [];
    for (const { ID } of found.messages ?? []) {
      const message = await getJson<MessageResponse>(`/api/v1/message/${encodeURIComponent(ID)}`);
      texts.push(message.Text ?? '');
    }
    return texts;
  }

  /** Chờ tới khi có thư gửi tới `to` chứa liên kết khớp `pattern`; hết hạn thì ném lỗi nêu rõ nguyên nhân. */
  async function waitForLink(to: string, pattern: RegExp): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    for (;;) {
      try {
        for (const text of await textsTo(to)) {
          const url = findUrl(text, pattern);
          if (url) return url;
        }
        lastError = undefined;
      } catch (error) {
        lastError = error; // Mailpit chưa sẵn sàng/không với tới: thử lại tới hết hạn
      }
      if (Date.now() >= deadline) {
        const reason = lastError instanceof Error ? ` (${lastError.message})` : '';
        throw new Error(
          `Không thấy thư tới người nhận thử khớp ${pattern} sau ${timeoutMs} ms${reason}. Kiểm tra Mailpit (MAILPIT_URL) và SMTP của web.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { textsTo, waitForLink };
}
