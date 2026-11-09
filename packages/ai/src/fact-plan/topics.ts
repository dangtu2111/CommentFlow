import { foldText } from '@flow/shared';
import type { FactTopic } from './types';

/**
 * Chủ đề sự kiện cần có trong fact plan, suy từ câu khách bằng quy tắc từ khóa (TẠM THỜI — nhóm (6) thay bằng mã chủ đề enum do extract trả, ADR 017). Hàm thuần; văn bản đã bỏ dấu.
 * Thứ tự cố định: price, stock, ship_fee, ship_time, cod, returns, warranty, payment.
 */
const RULES: ReadonlyArray<{ topic: FactTopic; pattern: RegExp }> = [
  { topic: 'price', pattern: /\bgia\b|bao nhieu|\bprice\b|how much|\bcost\b|bn tien/ },
  {
    topic: 'stock',
    pattern:
      /con hang|het hang|ton kho|\bstock\b|available|sold out|con (khong|ko|hk|hg|hok|hong|k)\b|con (may|bao nhieu|nhieu)/,
  },
  {
    topic: 'returns',
    pattern: /doi tra|hoan tra|doi hang|tra hang|\breturns?\b|exchange|refund|hoan tien/,
  },
  { topic: 'warranty', pattern: /bao hanh|warranty|guarantee/ },
  { topic: 'cod', pattern: /\bcod\b|thanh toan khi nhan hang|cash on delivery/ },
  {
    topic: 'payment',
    pattern:
      /chuyen khoan|tra gop|\bpayment\b|\binstallments?\b|\bbank transfer\b|thanh toan(?! khi nhan hang)/,
  },
];
const SHIPPING =
  /\bship\b|giao hang|van chuyen|delivery|shipping|freeship|nhan hang|giao ve|giao ra/;
const FEE = /phi\b|bao nhieu|\bfee\b|\bcost\b|\bprice\b|how much|tien|freeship|mien phi/;
const TIME = /bao lau|may ngay|khi nao|mat may|how long|\bdays?\b|bao gio|thoi gian|nhan duoc|when/;
const ORDER: FactTopic[] = [
  'price',
  'stock',
  'ship_fee',
  'ship_time',
  'cod',
  'returns',
  'warranty',
  'payment',
];

const CLAUSE_BREAK = /[,;?.!]| va | and | & /;

export function factTopicsOf(text: string): FactTopic[] {
  const found = new Set<FactTopic>();
  // Mỗi vế câu xét riêng: "Tote bag giá bao nhiêu, ship Hà Nội mất mấy ngày?" → giá (vế 1) + thời gian ship (vế 2), không nhầm "bao nhiêu" của vế 1 thành phí ship.
  for (const clause of foldText(text).split(CLAUSE_BREAK)) {
    if (SHIPPING.test(clause)) {
      for (const rule of RULES) {
        if (rule.topic !== 'price' && rule.topic !== 'stock' && rule.pattern.test(clause))
          found.add(rule.topic);
      }
      const fee = FEE.test(clause) || /\bgia\b/.test(clause);
      const time = TIME.test(clause);
      // "ship COD không" chỉ hỏi COD: không kéo thêm phí/thời gian.
      if (found.has('cod') && !fee && !time) continue;
      if (fee || !time) found.add('ship_fee');
      if (time || !fee) found.add('ship_time');
      continue;
    }
    for (const rule of RULES) if (rule.pattern.test(clause)) found.add(rule.topic);
    if (TIME.test(clause) && /giao/.test(clause)) found.add('ship_time');
  }
  return ORDER.filter((topic) => found.has(topic));
}
