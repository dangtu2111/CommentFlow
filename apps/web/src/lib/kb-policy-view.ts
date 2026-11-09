import {
  type PolicyFactKind,
  type PolicyFactOrigin,
  type PolicyFactStatus,
  parsePolicyFactData,
} from '@flow/shared';

/**
 * Mô hình hiển thị của trang "Chính sách có cấu trúc" (ADR 017). Hàm thuần: nhận các dòng `policy_facts` đã đọc (đã qua RLS), kiểm lại `data` bằng Zod, nhóm theo thẻ
 * (Ship / Đổi trả / Bảo hành / Thanh toán), ghép bản ĐÃ DUYỆT với bản NHÁP cùng (kind, slot), tính độ phủ. Không dịch chữ, không định dạng số (nơi hiển thị làm).
 */
export type PolicyFactRowView = {
  id: string;
  kind: PolicyFactKind;
  slot: string;
  data: unknown;
  status: PolicyFactStatus;
  origin: PolicyFactOrigin;
  evidence: string | null;
  sourceRef: string | null;
  rev: number;
};

export const POLICY_CARDS = ['ship', 'returns', 'warranty', 'payment'] as const;
export type PolicyCard = (typeof POLICY_CARDS)[number];

export type PolicyEntry = {
  slot: string;
  /** Bản đang duyệt (AI dùng); null = chưa có. */
  approved: PolicyFactRowView | null;
  /** Bản nháp đang chờ duyệt (do máy đề xuất hoặc Owner đã sửa tay); null = không có. */
  draft: PolicyFactRowView | null;
};

export type PolicyCoverage = 'approved' | 'draft' | 'none';

export type PolicyCardView = {
  card: PolicyCard;
  entries: PolicyEntry[];
  coverage: PolicyCoverage;
};

export type PolicyFactsView = {
  cards: PolicyCardView[];
  /** Số bản nháp đang chờ duyệt (banner "AI đề xuất N giá trị"). */
  pendingCount: number;
};

const CARD_OF_KIND: Record<PolicyFactKind, PolicyCard> = {
  ship_region: 'ship',
  cod: 'ship',
  returns: 'returns',
  warranty: 'warranty',
  payment: 'payment',
};

/** Dòng COD chung hiển thị chung thẻ Ship nhưng không phải dòng khu vực: tách khỏi bảng khu vực. */
export function isShipRegionRow(row: PolicyFactRowView): boolean {
  return row.kind === 'ship_region';
}

/** Nháp do Owner sửa tay: `origin = 'manual'` mà vẫn giữ trích dẫn của máy (xem `editPolicyDraft`). */
export function isEditedByOwner(row: PolicyFactRowView): boolean {
  return row.status === 'draft' && row.origin === 'manual' && row.evidence !== null;
}

/** Đề xuất của máy còn điều kiện/phạm vi chưa tách được → Owner phải xác nhận trước khi duyệt. */
export function needsReview(row: PolicyFactRowView): boolean {
  const data = row.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { needsReview?: unknown }).needsReview === true
  );
}

function coverageOf(entries: readonly PolicyEntry[]): PolicyCoverage {
  if (entries.some((entry) => entry.approved !== null)) return 'approved';
  if (entries.some((entry) => entry.draft !== null)) return 'draft';
  return 'none';
}

export function buildPolicyFactsView(rows: readonly PolicyFactRowView[]): PolicyFactsView {
  // Chỉ nhận dòng có `data` đúng cấu trúc (đọc lại bằng Zod ở ranh giới).
  const valid = rows.filter((row) => parsePolicyFactData(row.kind, row.data).success);
  const grouped = new Map<PolicyCard, Map<string, PolicyEntry>>(
    POLICY_CARDS.map((card) => [card, new Map()]),
  );
  for (const row of valid) {
    const bucket = grouped.get(CARD_OF_KIND[row.kind]) as Map<string, PolicyEntry>;
    const key = `${row.kind}\u0000${row.slot}`;
    const entry = bucket.get(key) ?? { slot: row.slot, approved: null, draft: null };
    if (row.status === 'approved') entry.approved = row;
    else entry.draft = row;
    bucket.set(key, entry);
  }
  const cards = POLICY_CARDS.map((card): PolicyCardView => {
    const entries = [...(grouped.get(card) as Map<string, PolicyEntry>).values()].sort((a, b) =>
      a.slot.localeCompare(b.slot),
    );
    return { card, entries, coverage: coverageOf(entries) };
  });
  return { cards, pendingCount: valid.filter((row) => row.status === 'draft').length };
}
