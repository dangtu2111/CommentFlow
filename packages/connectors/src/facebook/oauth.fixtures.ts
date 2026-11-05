/**
 * Fixture viết tay theo tài liệu Meta Graph API v27.0 (OAuth / `me/accounts` / `me`) — KHÔNG phải phản hồi thật.
 * Giá trị giả, không dùng được ở Meta. Đối chiếu khi có Meta App + Page thử (docs/CAN_BAN_CUNG_CAP.md).
 */
export const FIXTURE_APP_ID = '1234567890123456';
export const FIXTURE_APP_SECRET = 'fixture-app-secret-0123456789abcdef';
export const FIXTURE_REDIRECT_URI = 'https://app.example.test/api/channels/facebook/callback';

export const FIXTURE_SHORT_TOKEN = 'EAAFIXTURESHORT';
export const FIXTURE_LONG_TOKEN = 'EAAFIXTURELONG';

/** `GET /oauth/access_token` (đổi code và đổi token dài hạn cùng dạng). */
export const accessTokenResponse = (token: string) => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: 5183944,
});

export const PAGE_A = { id: '100000000000001', name: 'Shop Hoa Nhài', token: 'EAAFIXTUREPAGEA' };
export const PAGE_B = { id: '100000000000002', name: 'Tiệm Bánh Mơ', token: 'EAAFIXTUREPAGEB' };

const account = (page: { id: string; name: string; token: string }) => ({
  id: page.id,
  name: page.name,
  access_token: page.token,
  tasks: ['ADVERTISE', 'ANALYZE', 'CREATE_CONTENT', 'MESSAGING', 'MODERATE', 'MANAGE'],
});

/** `GET /me/accounts` — một trang cuối. */
export const accountsResponse = (...pages: (typeof PAGE_A)[]) => ({ data: pages.map(account) });

/** `GET /me/accounts` — trang giữa (có `paging.next`). */
export const accountsPageWithNext = (after: string, ...pages: (typeof PAGE_A)[]) => ({
  data: pages.map(account),
  paging: {
    cursors: { before: 'QVFIfake', after },
    next: `https://graph.facebook.com/v27.0/me/accounts?after=${after}`,
  },
});

/** `GET /me?fields=id` */
export const meResponse = (id: string) => ({ id });

/** Lỗi Graph dạng chuẩn (error-handling). */
export const graphError = (code: number, subcode?: number) => ({
  error: {
    message: 'fixture message — không được lọt ra ngoài',
    type: 'OAuthException',
    code,
    ...(subcode === undefined ? {} : { error_subcode: subcode }),
    fbtrace_id: 'FIXTUREtrace',
  },
});

/** `POST /{page-id}/subscribed_apps` và các lệnh ghi trả `{success:true}`. */
export const successResponse = { success: true };
