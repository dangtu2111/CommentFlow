import { metaWebhookHandlers } from '../../../../server/webhook-runtime';

// Webhook Meta: không đăng nhập, không cache; chữ ký kiểm trong handler (xem server/meta-webhook.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = metaWebhookHandlers.GET;
export const POST = metaWebhookHandlers.POST;
