#!/usr/bin/env node
// Gửi một webhook bình luận GIẢ (đã ký đúng như Meta) tới web ở máy dev để thử đường nhận → hàng đợi → worker mà
// chưa cần Meta thật. Dùng: `pnpm webhook:send -- --page <PAGE_ID> [--text "..."] [--url http://localhost:3000/api/webhooks/meta]`
// Khóa lấy từ META_APP_SECRET trong .env.local (Node đọc, không in ra). KHÔNG dùng cho staging/production.
import { createHmac, randomUUID } from 'node:crypto';
import { loadRepoEnv } from './lib/load-env.mjs';

loadRepoEnv(new URL('../', import.meta.url));

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const secret = process.env.META_APP_SECRET;
const pageId = option('page');
if (!secret) {
  console.error('Thiếu META_APP_SECRET (đặt trong .env.local).');
  process.exit(1);
}
if (!pageId) {
  console.error('Thiếu --page <PAGE_ID> (external_id của kênh đã kết nối + webhook_subscribed).');
  process.exit(1);
}
const url = option('url', 'http://localhost:3000/api/webhooks/meta');
{
  let target;
  try {
    target = new URL(url);
  } catch {
    target = null;
  }
  const local =
    target?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname);
  const tunnel = target?.protocol === 'https:' && target.hostname.endsWith('.trycloudflare.com');
  if (!local && !tunnel) {
    console.error(
      'Chỉ gửi tới http://localhost, http://127.0.0.1 hoặc https://*.trycloudflare.com (máy dev).',
    );
    process.exit(1);
  }
}

const postId = `${pageId}_${option('post', 'post-thu')}`;
const body = JSON.stringify({
  object: 'page',
  entry: [
    {
      id: pageId,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'feed',
          value: {
            from: { id: `khach-${randomUUID().slice(0, 8)}`, name: 'Khách Thử' },
            message: option('text', 'Áo này còn size M không shop?'),
            post_id: postId,
            comment_id: `${postId.split('_')[1]}_${randomUUID().slice(0, 12)}`,
            created_time: Math.floor(Date.now() / 1000),
            item: 'comment',
            parent_id: postId,
            verb: 'add',
          },
        },
      ],
    },
  ],
});
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const response = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
  body,
});
console.log(`HTTP ${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
