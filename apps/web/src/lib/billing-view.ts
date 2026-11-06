import type { InvoiceRow } from '@flow/db/runtime';

export type InvoiceTone = 'success' | 'warning' | 'muted';

export type InvoiceListRow = {
  id: string;
  number: string;
  /** yyyy-mm-dd (UTC): ngày thanh toán nếu đã trả, không thì ngày tạo. */
  dateIso: string;
  description: string;
  amountVnd: number;
  status: InvoiceRow['status'];
  tone: InvoiceTone;
};

export function invoiceStatusTone(status: InvoiceRow['status']): InvoiceTone {
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  return 'muted';
}

/** Mô tả từ `items[].description`; dữ liệu không đúng dạng → rỗng (không ném lỗi ra giao diện). */
function describeItems(items: unknown): string {
  if (!Array.isArray(items)) return '';
  return items
    .map((item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as { description?: unknown }).description === 'string'
        ? (item as { description: string }).description
        : '',
    )
    .filter(Boolean)
    .join(', ');
}

export function buildInvoiceRows(rows: readonly InvoiceRow[]): InvoiceListRow[] {
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    dateIso: (row.status === 'paid' && row.paidAt ? row.paidAt : row.createdAt)
      .toISOString()
      .slice(0, 10),
    description: describeItems(row.items),
    amountVnd: row.amountVnd,
    status: row.status,
    tone: invoiceStatusTone(row.status),
  }));
}
