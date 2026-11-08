import type { KbTopic } from '@flow/shared';

export type ConflictChunk = { chunkKey: string; sourceTitle: string; text: string; topic: KbTopic };

export type ConflictMember = {
  chunkKey: string;
  sourceTitle: string;
  sentence: string;
  value: string;
};

export type ConflictGroup = {
  /** Mã nhóm ổn định: `<chủ đề>:<đơn vị>`. */
  group: string;
  topic: KbTopic;
  /** Các giá trị lệch nhau, đã chuẩn hóa và sắp theo số. */
  values: string[];
  members: ConflictMember[];
};

type Quantity = { unit: string; value: string; sort: number; sentence: string };

const DURATION_TOPICS: readonly KbTopic[] = ['shipping_time', 'return', 'refund', 'warranty'];
const MONEY_TOPICS: readonly KbTopic[] = ['shipping_fee'];

const UNIT_ALIASES: Record<string, string> = {
  ngay: 'ngày',
  gio: 'giờ',
  tuan: 'tuần',
  thang: 'tháng',
  day: 'ngày',
  days: 'ngày',
  hour: 'giờ',
  hours: 'giờ',
  week: 'tuần',
  weeks: 'tuần',
  month: 'tháng',
  months: 'tháng',
};

const DURATION =
  /(\d+(?:\s*[-–]\s*\d+)?)\s*(ngày|giờ|tuần|tháng|days?|hours?|weeks?|months?)(?![\p{L}])/giu;
const MONEY = /(\d[\d.,]*)\s*(k|nghìn|ngàn|đ|vnđ|vnd|₫|usd|\$)(?![\p{L}])/giu;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function foldUnit(unit: string): string {
  const key = unit.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
  return UNIT_ALIASES[key] ?? unit.toLowerCase();
}

function parseAmount(raw: string): number {
  // "30.000" / "30,000" = 30000 (nhóm 3 chữ số); "2,5" = 2.5.
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  return Number(raw.replace(',', '.'));
}

function durations(sentence: string): Quantity[] {
  return [...sentence.matchAll(DURATION)].map((m) => {
    const amount = (m[1] ?? '').replace(/\s+/g, '').replace('–', '-');
    const unit = foldUnit(m[2] ?? '');
    return { unit, value: `${amount} ${unit}`, sort: Number.parseFloat(amount), sentence };
  });
}

function moneys(sentence: string): Quantity[] {
  return [...sentence.matchAll(MONEY)].flatMap((m): Quantity[] => {
    const rawUnit = (m[2] ?? '').toLowerCase();
    const base = parseAmount(m[1] ?? '');
    if (!Number.isFinite(base)) return [];
    if (rawUnit === 'usd' || rawUnit === '$') {
      return [{ unit: 'usd', value: `${base} USD`, sort: base, sentence }];
    }
    const vnd = ['k', 'nghìn', 'ngàn'].includes(rawUnit) ? base * 1000 : base;
    return [{ unit: 'vnd', value: `${vnd}đ`, sort: vnd, sentence }];
  });
}

function quantitiesOf(chunk: ConflictChunk): Quantity[] {
  const pick = DURATION_TOPICS.includes(chunk.topic)
    ? durations
    : MONEY_TOPICS.includes(chunk.topic)
      ? moneys
      : null;
  return pick ? sentences(chunk.text).flatMap(pick) : [];
}

/**
 * Phát hiện mâu thuẫn bằng QUY TẮC (không AI): cùng chủ đề + cùng đơn vị mà các NGUỒN khác nhau nêu giá trị khác nhau
 * (vd "giao 2 ngày" vs "giao 5 ngày"). Một nguồn tự nhắc nhiều số (nội thành/tỉnh) không bị coi là mâu thuẫn.
 */
export function detectConflicts(chunks: readonly ConflictChunk[]): ConflictGroup[] {
  type Entry = ConflictMember & { sort: number };
  const byGroup = new Map<string, { topic: KbTopic; entries: Entry[] }>();
  for (const chunk of chunks) {
    for (const q of quantitiesOf(chunk)) {
      const group = `${chunk.topic}:${q.unit}`;
      const bucket = byGroup.get(group) ?? { topic: chunk.topic, entries: [] };
      bucket.entries.push({
        chunkKey: chunk.chunkKey,
        sourceTitle: chunk.sourceTitle,
        sentence: q.sentence,
        value: q.value,
        sort: q.sort,
      });
      byGroup.set(group, bucket);
    }
  }
  const result: ConflictGroup[] = [];
  for (const [group, { topic, entries }] of byGroup) {
    const values = new Set(entries.map((e) => e.value));
    const sources = new Set(entries.map((e) => e.sourceTitle));
    if (values.size < 2 || sources.size < 2) continue;
    const sorted = [...entries].sort((a, b) => a.sort - b.sort);
    result.push({
      group,
      topic,
      values: [...new Set(sorted.map((e) => e.value))],
      members: entries.map(({ sort: _sort, ...member }) => member),
    });
  }
  return result;
}
