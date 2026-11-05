import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { isPlatformError, PlatformError } from '../errors';
import {
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  GRAPH_BASE_URL,
  graphErrorSchema,
  graphFailure,
  MAX_TIMEOUT_MS,
  readBoundedText,
} from './connector';

/**
 * Luồng OAuth Facebook Login for Business (docs/12 §1, docs/13 §2, ADR 010/011) — MỘT giao diện HTTP tiêm được
 * (`fetch`) để test bằng fixture viết tay theo tài liệu Meta v27.0; chưa gọi Meta thật. Cùng quy ước với connector:
 * lỗi ra ngoài chỉ là mã (`facebook_error_190`…), KHÔNG token/URL/thân phản hồi; không retry ngầm; thân phản hồi ≤ 2 MB.
 *
 * Token trả về là bí mật: nơi gọi KHÔNG log, chỉ giữ trong bộ nhớ hoặc cookie niêm phong, rồi mã hóa trước khi lưu.
 */

export const FACEBOOK_DIALOG_BASE_URL = 'https://www.facebook.com';
/** Quyền xin khi KHÔNG dùng cấu hình Login for Business (`config_id`): đủ để liệt kê Page, đăng ký webhook, đọc/trả lời/ẩn. */
export const FACEBOOK_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_engagement',
] as const;
const MAX_ACCOUNT_PAGES = 10;
const ACCOUNT_PAGE_SIZE = 100;

export type FacebookOAuthOptions = {
  appId: string;
  /** Khóa ứng dụng: đổi code/token và ký `appsecret_proof`. Do nơi dựng truyền vào; module không đọc `.env`. */
  appSecret: string;
  /** URI chuyển hướng đã đăng ký ở Meta (cố định; docs/13 §2). */
  redirectUri: string;
  /** ID cấu hình Facebook Login for Business (tùy chọn). Có → dùng `config_id` thay `scope`. */
  loginConfigId?: string;
  fetch?: typeof fetch;
  apiVersion?: string;
  timeoutMs?: number;
};

export type FacebookPageGrant = {
  /** Page ID (= `channels.external_id`). */
  id: string;
  name: string;
  /** Page token — bí mật. */
  accessToken: string;
  tasks: string[];
};

export interface FacebookOAuthClient {
  buildAuthorizeUrl(state: string): string;
  /** `code` → user token ngắn hạn. */
  exchangeCode(code: string): Promise<string>;
  /** user token ngắn hạn → dài hạn (Page token lấy từ token dài hạn không hết hạn). */
  extendUserToken(userToken: string): Promise<string>;
  listPages(userToken: string): Promise<FacebookPageGrant[]>;
  /** `GET /me?fields=id` bằng chính token đó: Page token trả Page ID của token. */
  getTokenOwnerId(token: string): Promise<string>;
}

const tokenResponseSchema = z.object({ access_token: z.string().min(1) });
const meSchema = z.object({ id: z.string().regex(/^[0-9]{1,30}$/) });
const accountsSchema = z.object({
  data: z.array(z.unknown()),
  paging: z
    .object({
      cursors: z.object({ after: z.string().optional() }).optional(),
      next: z.string().optional(),
    })
    .optional(),
});
const accountSchema = z.object({
  id: z.string().regex(/^[0-9]{1,30}$/),
  name: z.string().min(1),
  access_token: z.string().min(1),
  tasks: z.array(z.string()).optional(),
});

const fail = (message: string) => new PlatformError('UNKNOWN', { message });

export function createFacebookOAuthClient(options: FacebookOAuthOptions): FacebookOAuthClient {
  const {
    appId,
    appSecret,
    redirectUri,
    loginConfigId,
    apiVersion = DEFAULT_GRAPH_API_VERSION,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const doFetch = options.fetch ?? fetch;
  if (!appId) throw new Error('Thiếu ID ứng dụng Meta (appId).');
  if (!appSecret) throw new Error('Thiếu khóa ứng dụng Meta (appSecret).');
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error('Phiên bản Graph API sai dạng (vd v27.0).');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
    throw new Error(`timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}].`);
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new Error('redirectUri không phải URL hợp lệ.');
  }
  const isLocal = redirect.hostname === 'localhost' || redirect.hostname === '127.0.0.1';
  if (redirect.protocol !== 'https:' && !(isLocal && redirect.protocol === 'http:'))
    throw new Error('redirectUri phải là https (http chỉ cho localhost).');
  if (redirect.hash) throw new Error('redirectUri không được có fragment.');

  const proof = (token: string) => createHmac('sha256', appSecret).update(token).digest('hex');

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${GRAPH_BASE_URL}/${apiVersion}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let status: number;
    let headers: Headers;
    let text: string;
    try {
      const response = await doFetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      status = response.status;
      headers = response.headers;
      text = await readBoundedText(response);
    } catch (error) {
      if (isPlatformError(error)) throw error;
      throw fail('facebook_network_error'); // bỏ lỗi gốc: có thể chứa URL/token
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (status < 200 || status >= 300) throw graphFailure(status, body, headers);
    if (graphErrorSchema.safeParse(body).success) throw graphFailure(status, body, headers);
    return body;
  }

  async function tokenFrom(path: string, params: Record<string, string>): Promise<string> {
    const parsed = tokenResponseSchema.safeParse(await get(path, params));
    if (!parsed.success) throw fail('facebook_bad_response');
    return parsed.data.access_token;
  }

  return {
    buildAuthorizeUrl(state) {
      if (!state) throw new Error('Thiếu state.');
      const url = new URL(`${FACEBOOK_DIALOG_BASE_URL}/${apiVersion}/dialog/oauth`);
      url.searchParams.set('client_id', appId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      if (loginConfigId) {
        url.searchParams.set('config_id', loginConfigId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('override_default_response_type', 'true');
      } else {
        url.searchParams.set('scope', FACEBOOK_OAUTH_SCOPES.join(','));
        url.searchParams.set('response_type', 'code');
      }
      return url.toString();
    },

    async exchangeCode(code) {
      if (!code) throw fail('facebook_invalid_code');
      return tokenFrom('oauth/access_token', {
        client_id: appId,
        redirect_uri: redirectUri,
        client_secret: appSecret,
        code,
      });
    },

    async extendUserToken(userToken) {
      return tokenFrom('oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userToken,
      });
    },

    async listPages(userToken) {
      const result: FacebookPageGrant[] = [];
      const seen = new Set<string>();
      let after: string | undefined;
      for (let page = 1; page <= MAX_ACCOUNT_PAGES; page++) {
        const parsed = accountsSchema.safeParse(
          await get('me/accounts', {
            fields: 'id,name,access_token,tasks',
            limit: String(ACCOUNT_PAGE_SIZE),
            access_token: userToken,
            appsecret_proof: proof(userToken),
            ...(after === undefined ? {} : { after }),
          }),
        );
        if (!parsed.success) throw fail('facebook_bad_response');
        for (const raw of parsed.data.data) {
          const node = accountSchema.safeParse(raw);
          // Dòng hỏng/thiếu token (vd tài khoản không đủ quyền) bị bỏ — không đoán.
          if (!node.success || seen.has(node.data.id)) continue;
          seen.add(node.data.id);
          result.push({
            id: node.data.id,
            name: node.data.name,
            accessToken: node.data.access_token,
            tasks: node.data.tasks ?? [],
          });
        }
        const next = parsed.data.paging?.next ? parsed.data.paging.cursors?.after : undefined;
        if (!next) return result;
        after = next;
      }
      throw fail('facebook_too_many_pages'); // không trả danh sách thiếu
    },

    async getTokenOwnerId(token) {
      const parsed = meSchema.safeParse(
        await get('me', { fields: 'id', access_token: token, appsecret_proof: proof(token) }),
      );
      if (!parsed.success) throw fail('facebook_bad_response');
      return parsed.data.id;
    },
  };
}
