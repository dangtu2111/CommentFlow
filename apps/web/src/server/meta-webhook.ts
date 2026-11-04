import { timingSafeEqual } from 'node:crypto';
import {
  eventHashOf,
  parseMetaWebhook,
  serializeEvent,
  verifyMetaSignature,
} from '@flow/connectors';
import type { IngestJob } from '@flow/shared';

/** Thân webhook Meta rất nhỏ; giới hạn để cửa vào không cần đăng nhập không bị dùng làm bơm bộ nhớ. */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export type RecordedEvent = { eventId: string; workspaceId: string };

export type MetaWebhookDeps = {
  /** `META_APP_SECRET`; `undefined` = chưa cấu hình → 503 (không bao giờ chấp nhận khi thiếu). */
  appSecret: () => string | undefined;
  /** `META_WEBHOOK_VERIFY_TOKEN`. */
  verifyToken: () => string | undefined;
  /** Ghi sự kiện (hàm DB `cf.record_webhook_event`, trong `withSystem`); trả các dòng MỚI. */
  record: (input: {
    platform: 'facebook';
    pageExternalId: string;
    eventHash: string;
    payload: unknown;
  }) => Promise<RecordedEvent[]>;
  enqueue: (job: IngestJob) => Promise<void>;
  /** Chỉ tên sự kiện — KHÔNG đưa payload/chữ ký/khóa/nội dung lỗi vào log (nguyên tắc #6). */
  warn: (event: { event: string; reason?: string }) => void;
};

const text = (status: number, body = ''): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Đọc thân thô nhưng dừng ngay khi vượt giới hạn (không nạp cả thân khổng lồ vào bộ nhớ). */
async function readCapped(req: Request, limit: number): Promise<Buffer | 'too_large'> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return 'too_large';
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return 'too_large';
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export function createMetaWebhookHandlers(deps: MetaWebhookDeps) {
  /** Bắt tay đăng ký webhook (Meta gọi GET một lần): đúng verify token → trả nguyên `hub.challenge`. */
  async function handleGet(req: Request): Promise<Response> {
    const expected = deps.verifyToken();
    if (!expected) return text(503);
    const params = new URL(req.url).searchParams;
    const challenge = params.get('hub.challenge');
    const token = params.get('hub.verify_token');
    if (
      params.get('hub.mode') !== 'subscribe' ||
      token === null ||
      challenge === null ||
      !constantTimeEqual(token, expected)
    ) {
      return text(403);
    }
    return text(200, challenge);
  }

  /** Nhận sự kiện: kiểm chữ ký → ghi (idempotent) → enqueue `ingest` → 200. Sai chữ ký = không làm gì cả. */
  async function handlePost(req: Request): Promise<Response> {
    const secret = deps.appSecret();
    if (!secret) return text(503);

    const raw = await readCapped(req, MAX_WEBHOOK_BODY_BYTES);
    if (raw === 'too_large') return text(413);
    if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), secret)) {
      return text(401);
    }

    let json: unknown;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch {
      return text(400);
    }

    try {
      for (const event of parseMetaWebhook(json)) {
        const recorded = await deps.record({
          platform: 'facebook',
          pageExternalId: event.channelExternalId,
          eventHash: eventHashOf('facebook', event),
          payload: serializeEvent(event),
        });
        for (const row of recorded) {
          await deps.enqueue({ eventId: row.eventId, workspaceId: row.workspaceId });
        }
      }
    } catch (error) {
      // 500 để Meta gửi lại (ghi đã idempotent). Chỉ log tên lỗi, không nội dung.
      deps.warn({
        event: 'webhook_ingest_failed',
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return text(500);
    }
    return text(200, 'ok');
  }

  return { GET: handleGet, POST: handlePost };
}
