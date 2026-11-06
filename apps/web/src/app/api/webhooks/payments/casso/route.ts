import { bankWebhookHandlers } from '../../../../../server/bank-webhook-runtime';

// Webhook Casso (FR-124): không đăng nhập, không cache; token kiểm trong handler (server/bank-webhook.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = bankWebhookHandlers.casso;
