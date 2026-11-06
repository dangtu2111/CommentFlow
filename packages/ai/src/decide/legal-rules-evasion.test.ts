import { describe, expect, it } from 'vitest';
import { checkDraftLegal, detectLegalTopics, evaluateLegalRules } from './legal-rules';

describe('FR-160 cách nói thông dụng / lách từ khóa (theo verifier-security)', () => {
  it.each([
    ['hàng auth ko shop', 'authenticity'],
    ['Dạ auth 100% ạ', 'authenticity'],
    ['đây là hàng xịn hay hàng rep', 'authenticity'],
    ['is it a replica or counterfeit', 'authenticity'],
    ['cho mình xin hđ', 'invoice'],
    ['xuất bill được ko', 'invoice'],
    ['có chứng từ không', 'invoice'],
    ['VAT10% nhé', 'invoice'],
    ['V.A.T không', 'invoice'],
    ['ＶＡＴ có không', 'invoice'],
    ['bh mấy tháng', 'warranty'],
    ['có 1 đổi 1 không', 'warranty'],
    ['We offer a guaranteed fit and warranties', 'warranty'],
    ['hàng xách tay hay nội địa', 'origin'],
    ['sản xuất tại đâu', 'origin'],
    ['country of origins', 'origin'],
    ['cho đổi hàng không', 'refund'],
    ['trả lại tiền được ko', 'refund'],
    ['We offer refunds and a 30-day return policy', 'refund'],
    ['money back guarantee', 'refund'],
    ['bảo-hành thế nào', 'warranty'],
    ['b​ảo hành', 'warranty'],
  ])('FR-160 "%s" → %s', (text, topic) => {
    expect(detectLegalTopics(text)).toContain(topic);
  });

  it('FR-160 vẫn không nhận nhầm câu thường', () => {
    expect(detectLegalTopics('vật liệu vải gì, giá bao nhiêu, size nào')).toEqual([]);
  });

  it('FR-160 nháp "auth 100%" không nguồn bị chặn; câu khách "auth" bật cờ', () => {
    expect(checkDraftLegal({ draftText: 'Dạ auth 100% ạ', sources: [] }).ok).toBe(false);
    expect(evaluateLegalRules({ customerText: 'hàng auth ko', sources: [] }).legalUnsourced).toBe(
      true,
    );
  });
});

describe('FR-160 thời hạn / mức cam kết khó lách', () => {
  const warranty = (text: string) => [{ id: 'w', text }];

  it.each([
    'Bảo hành một năm ạ',
    'Bảo hành mười hai tháng ạ',
    'Bảo hành nửa năm ạ',
    'Bảo hành 4 tuần ạ',
    'Warranty: 30-day coverage',
    'Bảo hành 12 thg',
    'Bảo hành trọn đời ạ',
    'Warranty is for lifetime',
    'Bảo hành 0,5 năm',
  ])('FR-160 nháp "%s" khi nguồn chỉ nói 6 tháng → chặn', (draftText) => {
    expect(checkDraftLegal({ draftText, sources: warranty('Bảo hành 5 tháng') }).ok).toBe(false);
  });

  it('FR-160 số bằng chữ khớp nguồn → ok', () => {
    const out = checkDraftLegal({
      draftText: 'Bảo hành sáu tháng ạ',
      sources: warranty('Bảo hành 6 tháng'),
    });
    expect(out.ok).toBe(true);
  });

  it('FR-160 mức "100%" phải có trong nguồn cùng nhóm', () => {
    expect(
      checkDraftLegal({ draftText: 'Hoàn tiền 100% nhé', sources: warranty('Hoàn tiền một phần') })
        .ok,
    ).toBe(false);
    expect(
      checkDraftLegal({
        draftText: 'Hoàn tiền 100% nhé',
        sources: warranty('Hoàn tiền 100% nếu lỗi'),
      }).ok,
    ).toBe(true);
  });

  it('FR-160 "trọn đời" có trong nguồn thì ok', () => {
    expect(
      checkDraftLegal({
        draftText: 'Bảo hành trọn đời ạ',
        sources: warranty('Bảo hành trọn đời cho khung'),
      }).ok,
    ).toBe(true);
  });

  it('FR-160 văn bản quá dài → đầu vào không đọc được (đóng khi lỗi)', () => {
    const long = 'a'.repeat(20_001);
    expect(evaluateLegalRules({ customerText: long, sources: [] }).readable).toBe(false);
    expect(checkDraftLegal({ draftText: long, sources: [] }).ok).toBe(false);
  });
});
