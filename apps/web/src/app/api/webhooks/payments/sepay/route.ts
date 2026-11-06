import { bankWebhookHandlers } from '../../../../../server/bank-webhook-runtime';

// Webhook SePay (FR-124): không đăng nhập, không cache; khóa kiểm trong handler (server/bank-webhook.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = bankWebhookHandlers.sepay;
