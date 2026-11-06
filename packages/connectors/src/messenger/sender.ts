import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { type ActionDenial, textLengthOf } from '../capabilities';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';
import {
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  GRAPH_BASE_URL,
  graphErrorSchema,
  graphFailure,
  MAX_TIMEOUT_MS,
  readBoundedText,
} from '../facebook/connector';
import type { ChannelRef, ConversationRef, TokenProvider } from '../types';
import { messengerSendMode } from './window';

/**
 * Gửi tin Messenger (FR-014): Send API `POST /{page-id}/messages`. Quy ước giống connector Facebook (ADR 010): một lệnh =
 * một lần gọi mạng, không retry ngầm, không log, lỗi ra ngoài chỉ là mã — không token/URL/nội dung khách. Send API KHÔNG có
 * khóa idempotent → chống gửi trùng là việc của job gửi (chưa có; `MSG-INBOX`). Kiểm cửa sổ 24 giờ/7 ngày ở đây là lớp
 * phòng thủ thứ hai, sau `sendRecheck` R8.
 */

/** Giới hạn văn bản của Send API: 2000 ký tự. */
export const MESSENGER_MAX_TEXT_LENGTH = 2000;
/** PSID / Page ID: chuỗi số. */
const NUMERIC_ID = /^[0-9]{1,30}$/;

/** Gửi bị từ chối TRƯỚC khi gọi mạng vì ngoài cửa sổ hoặc cần người gửi. Không phải lỗi nền tảng → không thử lại. */
export class MessageNotAllowedError extends Error {
  readonly reason: ActionDenial;
  constructor(reason: ActionDenial) {
    super(`messenger_not_allowed_${reason}`);
    this.name = 'MessageNotAllowedError';
    this.reason = reason;
  }
}

export type MessengerSenderOptions = {
  tokenProvider: TokenProvider;
  /** Khóa ứng dụng: ký `appsecret_proof`. Do nơi dựng truyền; không đọc `.env`. */
  appSecret: string;
  fetch?: typeof fetch;
  apiVersion?: string;
  timeoutMs?: number;
  /** Đồng hồ tiêm được (test). */
  now?: () => Date;
};

export interface MessengerSender {
  sendMessage(
    channel: ChannelRef,
    conversation: ConversationRef,
    text: string,
    options: { humanAgent: boolean },
  ): Promise<{ externalId: string }>;
  mapError(error: unknown): PlatformError;
}

const fail = (code: PlatformErrorCode, message: string): PlatformError =>
  new PlatformError(code, { message });

const sentSchema = z.object({ message_id: z.string().min(1) });

export function createMessengerSender(options: MessengerSenderOptions): MessengerSender {
  const {
    tokenProvider,
    appSecret,
    apiVersion = DEFAULT_GRAPH_API_VERSION,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = () => new Date(),
  } = options;
  const doFetch = options.fetch ?? fetch;
  if (!appSecret) throw new Error('Thiếu khóa ứng dụng Meta (appSecret).');
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error('Phiên bản Graph API sai dạng (vd v27.0).');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
    throw new Error(`timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}].`);

  async function tokenOf(channel: ChannelRef): Promise<string> {
    try {
      return await tokenProvider.getAccessToken(channel);
    } catch (error) {
      if (isPlatformError(error)) throw error;
      throw fail('UNKNOWN', 'messenger_token_unavailable');
    }
  }

  async function post(channel: ChannelRef, payload: Record<string, unknown>): Promise<unknown> {
    const token = await tokenOf(channel);
    const body = JSON.stringify({
      ...payload,
      access_token: token,
      appsecret_proof: createHmac('sha256', appSecret).update(token).digest('hex'),
    });
    let status: number;
    let headers: Headers;
    let text: string;
    try {
      const response = await doFetch(
        new URL(`${GRAPH_BASE_URL}/${apiVersion}/${channel.externalId}/messages`),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        },
      );
      status = response.status;
      headers = response.headers;
      text = await readBoundedText(response);
    } catch (error) {
      if (isPlatformError(error)) throw error;
      // Ở bước ghi: mạng/timeout nghĩa là KHÔNG BIẾT đã gửi chưa → UNKNOWN; bỏ lỗi gốc (có thể chứa URL/token).
      throw fail('UNKNOWN', 'messenger_network_error');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (status < 200 || status >= 300 || graphErrorSchema.safeParse(parsed).success)
      throw graphFailure(status, parsed, headers);
    return parsed;
  }

  return {
    async sendMessage(channel, conversation, text, { humanAgent }) {
      // Token của kênh nào chỉ được dùng cho hội thoại của kênh đó, và chỉ Page Facebook (không IG/TikTok).
      if (channel.platform !== 'facebook' || conversation.channelId !== channel.id)
        throw fail('UNKNOWN', 'messenger_channel_mismatch');
      if (!NUMERIC_ID.test(channel.externalId) || !NUMERIC_ID.test(conversation.externalId))
        throw fail('UNKNOWN', 'messenger_invalid_id');
      const length = textLengthOf(text);
      if (text.trim() === '' || length > MESSENGER_MAX_TEXT_LENGTH)
        throw fail('UNKNOWN', 'messenger_text_invalid');
      const mode = messengerSendMode({
        lastUserMessageAt: conversation.lastUserMessageAt,
        now: now(),
        byHuman: humanAgent,
      });
      if (!mode.allowed) throw new MessageNotAllowedError(mode.reason);

      const sent = sentSchema.safeParse(
        await post(channel, {
          recipient: { id: conversation.externalId },
          messaging_type: mode.messagingType,
          ...(mode.messagingType === 'MESSAGE_TAG' ? { tag: mode.tag } : {}),
          message: { text },
        }),
      );
      // 2xx nhưng không có message_id: có thể ĐÃ gửi → UNKNOWN (job kiểm lại trước khi gửi lại).
      if (!sent.success) throw fail('UNKNOWN', 'messenger_bad_response');
      return { externalId: sent.data.message_id };
    },

    mapError(error: unknown): PlatformError {
      return isPlatformError(error) ? error : fail('UNKNOWN', 'messenger_unknown_error');
    },
  };
}
