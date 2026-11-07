import { describe, expect, it } from 'vitest';
import { MAX_PREVIOUS_TURN_CHARS, parsePreviousTurns } from './try-ai-previous';

describe('Thử AI — ô "lượt trước"', () => {
  it('không phải chuỗi / rỗng → không có lượt', () => {
    expect(parsePreviousTurns(null)).toEqual([]);
    expect(parsePreviousTurns(42)).toEqual([]);
    expect(parsePreviousTurns('  \n \n')).toEqual([]);
  });

  it('tiền tố Khách:/Shop:/Customer: chọn người nói; thiếu tiền tố = khách; cũ → mới', () => {
    const turns = parsePreviousTurns(
      'Khách: áo thun basic giá bn?\nShop: Dạ bạn chọn size và màu nào ạ?\nCustomer: ok\nchưa có tiền tố',
    );
    expect(turns.map((t) => [t.from, t.text])).toEqual([
      ['customer', 'áo thun basic giá bn?'],
      ['shop', 'Dạ bạn chọn size và màu nào ạ?'],
      ['customer', 'ok'],
      ['customer', 'chưa có tiền tố'],
    ]);
    expect(turns.map((t) => t.at.getTime())).toEqual(
      [...turns.map((t) => t.at.getTime())].sort((a, b) => a - b),
    );
  });

  it('chỉ giữ 5 lượt cuối, cắt mỗi lượt ở 500 ký tự, bỏ dòng chỉ có tiền tố', () => {
    const many = Array.from({ length: 8 }, (_, i) => `Khách: lượt ${i}`).join('\n');
    expect(parsePreviousTurns(many).map((t) => t.text)).toEqual([
      'lượt 3',
      'lượt 4',
      'lượt 5',
      'lượt 6',
      'lượt 7',
    ]);
    expect(parsePreviousTurns(`Khách: ${'x'.repeat(900)}`)[0]?.text).toHaveLength(
      MAX_PREVIOUS_TURN_CHARS,
    );
    expect(parsePreviousTurns('Shop:   \nKhách: có')).toHaveLength(1);
  });

  it('CHE PII: số điện thoại và email trong lượt trước không lọt ra', () => {
    const [turn] = parsePreviousTurns('Khách: gọi 0912345678 hoặc khach@example.com nhé');
    expect(String(turn?.text)).not.toContain('0912345678');
    expect(String(turn?.text)).not.toContain('khach@example.com');
  });
});
